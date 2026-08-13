# 09 — Évolution rôles / permissions / workflows : analyse d'impact

> **Étape d'analyse — aucun code modifié.** Ce document présente l'architecture
> actuelle, ce qui doit changer, ce qui est réutilisé, les migrations, les
> nouveaux modèles et les risques de régression. À valider avant implémentation.

---

## 0. Constat central

**Une grande partie du besoin est déjà en place** (lots Demand Management D1–D7 +
gouvernance budgétaire P2). Le cycle métier demandé —
`Demande → Manager → PMO → Business Case → Finance → Direction → Projet` — **existe
déjà** sous forme de workflow générique piloté par la base. L'évolution consiste
surtout à **activer la couche de permissions fines (dormante)**, ajouter les
**écrans d'administration**, rendre **les seuils budgétaires configurables**, et
poser la **séparation des responsabilités** — sans réécrire l'existant.

---

## 1. Architecture actuelle

### 1.1 Authentification
- JWT access (15 min) + refresh, argon2, MFA/TOTP, verrouillage de compte,
  throttling. Gardes globaux : `JwtAuthGuard`, `RolesGuard`, `ThrottlerGuard`.
- **JWT payload** : `{ sub, email, org, roles: string[], name }` — les rôles
  (clés) sont déjà dans le jeton ; **pas de permissions**.

### 1.2 Rôles (existant, réutilisable tel quel)
- Enum `RoleKey` : `admin, manager, project_manager, pmo, finance, employee,
  observer, guest, business_analyst, executive` → couvre **tous** les rôles
  métier demandés (Collaborateur = `employee`, Chef de projet = `project_manager`,
  Direction = `executive`, Responsable financier = `finance`).
- `Role` : `key RoleKey?`, `isSystem`, `organizationId String?` (null = global),
  `name`. **Rôles personnalisés déjà possibles** (`key = null`).
- **`UserRole` (M2M) → le multi-rôles est déjà supporté au niveau base.** La garde
  fait déjà l'union (`required.some(r => user.roles.includes(r))`).
- Seed : 10 rôles système globaux. **Aucune permission seedée.**

### 1.3 Permissions (infrastructure présente mais **inutilisée**)
- `Permission (action, subject, conditions Json)` (style CASL) + `RolePermission`
  (M2M) **existent en base** mais ne sont **jamais lues** : aucune garde de
  permission, rien dans le JWT, tables vides.
- Le contrôle réel se fait aujourd'hui **par clé de rôle** :
  - `@Roles(...RoleKey)` + `RolesGuard` au niveau route (5 contrôleurs) ;
  - vérifications applicatives éparses `payload.roles.some(...)` dans **12
    services** (project, finance, budget-governance, demand, business-cases,
    portfolio, task, board, comment, document, quote, workflow).

### 1.4 Workflow générique (existant, réutilisable, **déjà configurable en base**)
- `WorkflowDefinition / State / Transition / Instance / TransitionLog`.
- Transition = `fromState → toState`, gardée par `allowedRoles` (JSON de RoleKey)
  + `requiresComment` + `autoAction` (ex. `{createProject:true}`). L'admin
  franchit toujours (bypass).
- Multi-définitions par `entityType` (`isDefault`) → **le besoin « workflows
  multiples » (§19) est architecturalement déjà couvert**.
- **Manque** : pas de champ « condition/garde métier » sur la transition (ex.
  « Business Case complet », « budget validé ») ; ces règles sont aujourd'hui
  codées dans les services appelants. Pas d'API/UI d'administration du workflow.

### 1.5 Demand Management (déjà livré, réutilisé intégralement)
Workflow demande à 9 états
`draft → submitted → manager_review → pmo_qualification → business_case →
finance_review → committee → approved / rejected`, 12 transitions gardées par
rôle (`submit, manager_approve, pmo_qualify, prepare_business_case,
finance_validate, submit_to_committee, committee_approve, request_changes,
reject_*`). À l'approbation comité : **conversion automatique** en projet +
BudgetRequest approuvé + reprise risques/pièces + audit + notifications.
Business Case + registre de risques + restriction de création directe (D7) déjà
en place.

### 1.6 Gouvernance budgétaire (existant, à faire évoluer)
- `BudgetRequest` + `ApprovalStep` multi-étapes. **Chaîne codée en dur** :
  `Finance (0) → admin (1)`. **Pas de seuils, pas de séparation des
  responsabilités** (le demandeur pourrait valider s'il a le rôle).

### 1.7 Projets, finances, audit, notifications
- Projet : `managerId`, membres (`ProjectRole`), `demandId` (origine),
  `allowDirectProjectCreation`. **L'affectation du chef ne vérifie pas** que
  l'utilisateur a le rôle `project_manager` (seulement qu'il est dans l'org).
- Finance : lignes CAPEX/OPEX, coûts, consolidation portefeuille. Gardes par rôle.
- Audit immuable (`audit_logs`), notifications in-app + email (cloche),
  page « Mes tâches » (`/api/v1/me/tasks`) → **patron réutilisable pour « Mes
  validations »**.
- Admin front : `Paramètres → Administration` (onglets Membres + Catégories).
  **Pas d'onglet Rôles.** Invitation = **un seul rôle**, aucune gestion des rôles
  d'un utilisateur existant.

---

## 2. Ce qui doit être modifié / ajouté

| # | Besoin | Nature | Réutilise |
|---|---|---|---|
| A | **Couche permissions fines** : catalogue seedé, mapping rôles→permissions, `@RequirePermissions` + `PermissionsGuard`, résolution des permissions effectives, exposition (`/auth/me`), remplacement **progressif** des `roles.some(...)` | Backend | tables `Permission`/`RolePermission` (dormantes), `RolesGuard` (patron) |
| B | **Page Paramètres → Rôles** : lister/créer/modifier/désactiver, attribuer permissions, voir les utilisateurs d'un rôle | Back + Front | admin settings, `Role` |
| C | **Gestion multi-rôles d'un utilisateur** (cases à cocher) + endpoint set-roles | Back + Front | `UserRole` (déjà M2M), members |
| D | **Seuils budgétaires configurables** (< 10 k → Manager ; 10–100 k → Finance ; > 100 k → Finance + Direction) | Back | budget-governance, `ApprovalStep` |
| E | **Séparation des responsabilités (SoD)** : interdiction de valider son propre budget / auto-approbation | Back | budget-governance, workflow |
| F | **Espace « Mes validations »** : agrège demandes et budgets en attente de MON action | Back + Front | patron my-tasks, workflow instances, budget requests |
| G | **Vérif rôle Chef de projet** à l'affectation (`managerId` doit avoir `project_manager`) | Back | projects.service |
| H | **Contournement admin tracé** : création directe = motif **obligatoire** + audit marqué « hors workflow » | Back + Front | D7, audit |
| I | **Garde « Business Case complet »** avant l'étape suivante | Back | business-cases, workflow |
| J | **Matrice des responsabilités (§18)** en lecture + **admin de workflow (§19)** | Front (+ Back léger) | RolePermission, workflow engine |

---

## 3. Éléments réutilisés (ne rien dupliquer)

- **Rôles + multi-rôles** : `Role` / `UserRole` tels quels (le multi-rôles marche
  déjà). On **n'ajoute pas** de second système de rôles.
- **Permissions** : on **active** `Permission` / `RolePermission` existantes.
- **Moteur de workflow** générique : réutilisé pour la demande et tout futur
  workflow (§19 déjà supporté).
- **Demand → Business Case → conversion → budget → risques → audit →
  notifications** : conservés, on greffe permissions + gardes.
- **Patron « Mes tâches »**, **cloche de notifications**, **AuditService**,
  **page d'admin**, **design system** : réutilisés.

---

## 4. Migrations de base de données

Toutes **additives / non destructives** (pattern éprouvé cette session).

1. **`Role`** : `+ active Boolean @default(true)`, `+ description String?`.
   (`organizationId` déjà nullable pour rôles perso par org.)
2. **Permissions** : *pas de changement de schéma* — seed du **catalogue** (les
   ~30 permissions listées §4 de l'énoncé) + `RolePermission` reproduisant à
   l'identique les droits actuels (migration de données idempotente).
3. **Seuils budgétaires** : `Organization.settings` (JSON déjà présent) **ou**
   nouveau modèle `BudgetApprovalPolicy (organizationId, minAmount, maxAmount?,
   requiredRoleKeys Json, position)`. → **décision §7**.
4. **Contournement admin** : `Project.+ createdViaBypass Boolean @default(false)`,
   `+ bypassReason String?` (sinon tout via audit). → **décision §7**.
5. **Garde métier de transition** *(optionnel)* : `WorkflowTransition.+ guardKey
   String?` (ex. `business_case_complete`, `budget_validated`), interprété par le
   moteur. Nullable → n'affecte pas l'existant.
6. **Business Case** *(optionnel)* : `+ requiredComplete` calculé en service (pas
   de colonne) ; éventuellement `submittedAt`.

Aucune migration ne touche aux colonnes existantes.

---

## 5. Nouveaux modèles / composants

**Backend**
- `PermissionKey` (enum ou constantes centralisées) + catalogue seedé.
- `@RequirePermissions(...)` (décorateur) + `PermissionsGuard`.
- `PermissionsService` : résout les permissions effectives d'un user (union des
  rôles → permissions), avec cache court.
- `RolesModule` (admin) : CRUD rôles + attribution permissions + users par rôle.
- Endpoint `PUT /members/:userId/roles` (set multi-rôles).
- `BudgetApprovalPolicy` (si option table) + logique de construction de chaîne
  depuis le montant.
- `/me/approvals` (« Mes validations »).
- `/auth/me` enrichi (rôles + permissions effectives).

**Frontend**
- `Paramètres → Rôles` (+ matrice permissions).
- Édition multi-rôles d'un membre (cases à cocher).
- Page **Mes validations** (topbar/badge).
- Champ **motif** sur création directe admin.
- Hook `usePermissions()` (UX uniquement ; le back tranche).

---

## 6. Risques de régression et mitigations

| Risque | Mitigation |
|---|---|
| Remplacer les `roles.some(...)` par des permissions dans 12 services casse des comportements | Seed `RolePermission` **répliquant exactement** les droits actuels ; migration **service par service** ; suite de tests verte à chaque étape ; garder les gardes rôle en filet le temps de la bascule |
| Permissions dans le JWT → jeton lourd + rôle modifié = reconnexion | **Résolution côté serveur par requête** (DB + cache court), pas de permissions figées dans le JWT ; `/auth/me` pour le front |
| Seuils budgétaires (dur → configurable) cassent budget-governance et la conversion (qui crée un BudgetRequest déjà approuvé 2 étapes) | Valeurs par défaut = chaîne actuelle ; conversion adaptée pour générer la chaîne conforme au montant |
| Garde « Business Case complet » bloque des demandes de test | N'appliquer qu'à la transition ciblée ; mettre à jour les tests concernés |
| Vérif rôle `project_manager` casse des affectations existantes (données démo sans ce rôle) | Attribuer le rôle aux users concernés au seed / à la migration de données ; message d'erreur clair |
| SoD budgétaire bloque un admin ou un cas légitime | L'admin conserve le bypass tracé ; SoD paramétrable |
| Multi-suites de tests d'intégration | Le helper `resetDatabase` partagé absorbe déjà les nouvelles tables |

---

## 7. Décisions (validées)

1. **Permissions effectives** : ✅ **résolues par requête côté serveur** (DB +
   cache court). Pas de reconnexion au changement de rôle ; JWT inchangé (rôles).
2. **Seuils budgétaires** : ✅ **table dédiée `BudgetApprovalPolicy`** (org,
   montant min/max, rôles requis, ordre) — structuré et requêtable.
3. **Contournement admin** : ✅ **uniquement dans l'audit** (motif obligatoire
   passé à la création, journalisé comme franchissement hors workflow). Aucune
   colonne ajoutée à `Project`.
4. **Périmètre** : on démarre par la **fondation permissions** (R1) puis on
   déroule R2→R8.

---

## 8. Plan d'implémentation progressif proposé

| Lot | Contenu | Risque |
|---|---|---|
| **R1** | Catalogue de permissions + `RolePermission` (réplique l'existant) + `PermissionsService` + `@RequirePermissions`/guard + `/auth/me`. **Aucun changement de comportement.** | Faible |
| **R2** | Page **Paramètres → Rôles** (CRUD, permissions, users par rôle) + `Role.active/description` | Faible |
| **R3** | **Gestion multi-rôles** d'un membre (endpoint + UI cases à cocher) | Faible |
| **R4** | Bascule **progressive** des services vers les permissions (12 services), tests verts | Moyen |
| **R5** | **Seuils budgétaires configurables** + **SoD** + garde « budget validé avant projet » | Moyen |
| **R6** | Vérif **rôle Chef de projet** + **contournement admin** (motif + audit) + garde **Business Case complet** | Moyen |
| **R7** | **Mes validations** (back + front) + notifications de transition affinées | Faible |
| **R8** | **Matrice des responsabilités** (lecture) + **admin de workflow** (§19) | Moyen |

Chaque lot : implémentation → tests d'intégration sur MySQL réel → vérif → commit,
sans casser l'existant.
