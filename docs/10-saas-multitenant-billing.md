# 10 — Transformation SaaS multi-tenant + Stripe (audit & architecture)

> Statut : **PROPOSITION** (Phases 1 & 2 de la mission). Aucune modification de code
> tant que l'ordre des lots et les décisions ouvertes ne sont pas validés.
> Règle directrice : **étendre l'existant, ne rien réécrire**, isolation tenant
> prioritaire sur tout le reste.

## 1. Audit de l'existant (Phase 1)

### 1.1 Ce qui est DÉJÀ en place (à réutiliser)
- **Tenant = `Organization`** : discriminant `organization_id` présent sur **25 entités**
  (users, roles, projects, portfolios, demands, budgets, risks, workflows, documents,
  notifications, audit_logs, …). Chaque repository filtre déjà par `organizationId`.
- **Inscription** : `POST /auth/register` crée org + slug + utilisateur **owner (rôle admin)**
  dans une transaction.
- **RBAC** : rôles système + rôles personnalisés par org, permissions fines
  (`Permission`/`RolePermission`), `@RequirePermissions` + `PermissionsGuard`,
  résolution des rôles/permissions **en base à chaque requête** (garde JWT, cache 30 s).
- **Invitations** : modèle `Invitation` **rattaché à une org**, `token_hash` SHA-256
  (jamais en clair), `expires_at`, `accepted_at`, `role_id`. Conforme §18/§19/§53.
- **Audit** (`AuditLog` org-scoped), **notifications** (org-scoped), **workflows**
  configurables, **finances/budgets/devis**, **dashboards** (calculés par org).
- **JWT** : `{ sub, email, org, roles, name }` — `org` figé à la connexion ; les rôles
  sont désormais relus en base (garde) donc « frais ».

### 1.2 Écarts vs cible SaaS (à construire)
| Domaine | État actuel | Écart |
|---|---|---|
| **User ↔ Org** | **1:1** (`user.organization_id` requis, `email` unique **global**) | Cible **N:N** via `OrganizationMembership`. **Refactor structurel majeur.** |
| **Rôles** | liés à `user` (`UserRole`) | Cible : liés au **membership** (rôle par org) |
| **Contexte tenant** | `org` figé dans le JWT | Cible : org courante = membership actif **vérifié**, sélecteur + switch |
| **Owner** | « premier admin » implicite | Cible : `Organization.owner_user_id` explicite + transfert audité |
| **Abonnement** | `Organization.plan` (string libre) | Cible : `Subscription` complet + états |
| **Stripe** | absent | Customer, Checkout, Portal, Webhooks, idempotence |
| **Trial** | absent | 14 j à la création d'org |
| **Sièges/billing** | absent | `BillingSeatService`, sync quantité Stripe, proratisation |
| **Permissions billing** | absentes | `BILLING_*`, `SUBSCRIPTION_*`, `INVOICE_VIEW`, … |
| **Entitlements** | absent | Plan → features (SSO, SCIM, SLA… Enterprise) |
| **Platform Admin** | absent | Séparation nette Platform vs Organization admin + break-glass |
| **Redis/Worker** | absent | Optionnel : réconciliation via scheduler ; Redis non requis au départ |

## 2. Architecture cible (Phase 2)

### 2.1 Modèle de données (nouvelles tables / champs)
```
Organization            (+ owner_user_id, country, address, vat_number, logo_url)
OrganizationMembership  (id, user_id, organization_id, status[INVITED|ACTIVE|SUSPENDED|REMOVED],
                         is_owner, created_at, updated_at)  UNIQUE(user_id, organization_id)
MembershipRole          (membership_id, role_id)           -- rôles PAR org (remplace UserRole en contexte)
Subscription            (organization_id, stripe_customer_id, stripe_subscription_id, plan_id,
                         status, quantity, currency, unit_price, billing_interval,
                         trial_start, trial_end, current_period_start/end,
                         cancel_at_period_end, canceled_at)
SubscriptionPlan        (key[STANDARD|ENTERPRISE], stripe_price_monthly, stripe_price_yearly, unit_amount)  -- donnée PLATEFORME
BillingEvent            (stripe_event_id UNIQUE, type, payload, processed_at, result)      -- idempotence
Invoice                 (organization_id, stripe_invoice_id, amount, status, period, pdf_url)
EnterpriseContract      (organization_id, contract_start/end, custom_price, entitlements Json)
Entitlement / plan_entitlements  -- Plan → features
```
Index cibles : `(organization_id, status)`, `(organization_id, created_at)`,
`stripe_customer_id`, `stripe_subscription_id`, `subscription.organization_id UNIQUE`.

### 2.2 Contexte tenant par requête
```
JWT (sub) → membership actif pour l'org courante → rôles(membership) → permissions
```
- L'org courante provient d'un **claim `org` dans le JWT** (posé au login/au switch),
  **revalidé** à chaque requête : `membership ACTIVE (user, org)` sinon 401/403 +
  audit `CROSS_TENANT_ACCESS_ATTEMPT`. Le front **ne peut jamais** imposer `organization_id`.
- Switch d'org = endpoint dédié qui ré-émet un jeton avec la nouvelle `org` **après**
  vérification du membership.

### 2.3 Domaine billing (services, pas de logique Stripe dans les controllers)
`OrganizationService`, `MembershipService`, `BillingSeatService`, `SubscriptionService`,
`StripeService`, `WebhookService`, `InvoiceService`, `EntitlementService`.

### 2.4 Flux Stripe (résumé)
- **Checkout** : backend valide user→membership→permission `SUBSCRIPTION_MANAGE`→org,
  crée/récupère `stripe_customer_id`, ouvre une Checkout Session. `success_url` **≠ preuve**.
- **Webhook** `POST /webhooks/stripe` (public HTTPS) : vérif signature → `BillingEvent`
  (idempotence via `stripe_event_id UNIQUE`) → mise à jour `Subscription`/`Invoice` → audit.
- **Seats** : `BillingSeatService.isBillableUser()` centralisé → quantité recalculée **backend**
  → `SubscriptionService.syncQuantity()` (proratisation Stripe).
- **États** : `TRIAL → ACTIVE → PAST_DUE → GRACE → SUSPENDED / CANCELED / ENTERPRISE`
  mappés sur les statuts Stripe. Suspension = lecture seule, **jamais** de suppression de données.

### 2.5 Sécurité (transverse, non négociable)
Isolation par `organization_id` sur chaque accès (repository/service), refus IDOR/BOLA,
audit des tentatives cross-tenant, webhooks signés, secrets en `.env` uniquement,
permissions billing distinctes, MFA déjà dispo pour les rôles sensibles.

## 3. Stratégie de migration des données (§74/§75) — sans perte
Le modèle est **déjà** org-scoped : chaque user/projet/etc. a une `organization_id`.
La migration consiste donc surtout à **introduire les memberships sans casser le 1:1** :
1. Ajouter `OrganizationMembership` + `MembershipRole` (tables neuves, additives).
2. **Backfill** : pour chaque `user`, créer 1 membership `ACTIVE` vers `user.organization_id`,
   `is_owner = (user est le créateur/l'admin d'origine)`, et copier ses `UserRole` en `MembershipRole`.
3. Poser `Organization.owner_user_id` = créateur d'origine (déductible de l'audit `register`).
4. Créer une `Subscription` `TRIAL` (ou `ACTIVE community`) rétroactive par org existante.
5. `user.organization_id` **conservé** comme « org par défaut » pendant une phase de transition,
   puis rendu optionnel une fois le contexte membership généralisé (migration réversible).
Aucune donnée supprimée ; migrations Prisma additives d'abord, contraignantes ensuite.

## 4. Plan par lots (mappé sur vos Phases 3→15)
Chaque lot : migration → implémentation → tests intégration MySQL réel → build → **commit** → déploiement Docker, **sans casser l'existant**.

| Lot | Contenu | Phases spec | Risque |
|---|---|---|---|
| **S1** | Schéma billing/membership + backfill (owner, membership, trial). **Additif, aucun changement de comportement.** | 3, 74, 75, 76 | Moyen |
| **S2** | Owner explicite + permissions `BILLING_*`/`SUBSCRIPTION_*` + page « Abonnement & Facturation » (lecture) | 16, 41, 42, 45 | Faible |
| **S3** | Trial 14 j + états d'abonnement + garde lecture-seule sur trial expiré/suspendu | 35, 36, 37, 38, 79 | Moyen |
| **S4** | `StripeService` + Checkout + Customer + Portal (test mode, config `.env`) | 24, 30, 31, 40, 86 | Moyen |
| **S5** | Webhooks signés + `BillingEvent` idempotent + réconciliation | 32, 33, 34, 77, 78, 87 | Élevé |
| **S6** | Seats : `BillingSeatService` + sync quantité + proratisation | 26, 27, 28, 85 | Moyen |
| **S7** | **Multi-org memberships** : contexte tenant par membership, sélecteur, switch sécurisé, rôles par org | 5–10, 89 | **Élevé (refactor)** |
| **S8** | Entreprise : contrats + entitlements + `EntitlementService` | 46, 47, 88 | Moyen |
| **S9** | Platform Admin + break-glass + page admin plateforme | 48–50, 80 | Moyen |
| **S10** | Durcissement sécurité (cross-tenant, cache/fichiers/exports/jobs tenant-aware) + tests sécurité | 12, 13, 55–62, 70–73 | Élevé |

**Recommandation d'ordre** : livrer **la monétisation d'abord** (S1→S6, sur le modèle
1-org actuel qui isole déjà parfaitement) puis le **multi-org (S7)** comme lot dédié.
Raison : le refactor N:N touche l'auth et **toutes** les requêtes ; le livrer en dernier
sur une base déjà testée réduit le risque de régression. (Alternative : S7 en premier si
le multi-org est un prérequis commercial impératif — à trancher.)

## 5. Décisions requises avant de coder
1. **Ordre** : billing d'abord (S1→S6) puis multi-org (S7) — ou multi-org d'abord ?
2. **Stripe** : fournir des **clés test** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_STANDARD_MONTHLY/YEARLY`) **dans le `.env`** (jamais collées dans le chat).
   Sans clés, S4/S5 sont implémentés et testés avec le **mode test Stripe / mocks**.
3. **Trial** : CB requise au démarrage ? (spec §25 : non → trial sans CB).
4. **Redis/Worker** : rester **sans Redis** (webhooks synchrones + scheduler cron) au départ ?
5. **Platform Admin** : périmètre (lecture seule des orgs vs actions), et faut-il le livrer tôt ?
