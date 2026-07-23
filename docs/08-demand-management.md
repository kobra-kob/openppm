# 08 — Demand Management : analyse d'impact et plan d'intégration

> Document d'analyse **préalable à l'implémentation**. Objectif : étendre l'application
> au cycle complet « Idée → Demande → … → Archivage » sans réécrire l'existant.
> Statut : **en attente de validation**.

---

## 0. Écarts entre l'énoncé et le code réel

Vérifications faites sur le dépôt avant toute proposition. Trois éléments cités
comme existants ne le sont pas — ils changent le périmètre.

| Élément supposé existant | Réalité constatée | Conséquence |
|---|---|---|
| Module **Risques** | **Absent** (aucun modèle ni module) | « transférer les risques vers le registre du projet » suppose de **créer** ce registre |
| **Programmes** | **Absent** | À trancher : hors périmètre proposé |
| **Moteur de workflow** | **Absent**. Deux workflows *sur-mesure* : `budget-governance` (BudgetRequest + ApprovalStep) et `quote` (statuts + rôles en dur) | Le moteur est donc **à créer** |
| « Système de permissions déjà présent » | Tables `Permission` / `RolePermission` présentes **mais non exploitées** par l'API | L'autorisation réelle = `RoleKey` + `RolesGuard` + contrôles métier en service |

**Modules API actuels** : `auth`, `members`, `portfolio`, `project`, `budget-governance`,
`finance`, `quote`, `task`, `board`, `search`, `document`, `comment`
(+ `core` : audit, favorites, mailer, notifications, prisma).
Le Gantt n'est pas un module : c'est un endpoint CPM du module `project`.

### Point d'arbitrage majeur : le budget

Une règle forte a été posée précédemment : **le budget d'un projet n'est jamais saisi
librement, il découle du circuit de gouvernance**. L'énoncé demande maintenant que le
projet créé récupère « automatiquement le budget » de la demande. C'est contradictoire
en l'état.

**Proposition** : l'approbation par le **Comité d'investissement** *est* l'acte de
gouvernance. À la conversion, le système crée le projet **et** une `BudgetRequest`
déjà approuvée qui référence la demande, ce qui fixe `project.budget` par le chemin
normal. Aucune règle n'est cassée, l'historique reste cohérent et auditable.

---

## 1. Modules concernés

| Module | Nature de l'impact |
|---|---|
| `workflow` *(nouveau)* | Moteur générique réutilisable |
| `demand` *(nouveau)* | Demandes, Business Case, conversion |
| `risk` *(nouveau, à valider)* | Registre des risques projet + reprise depuis le Business Case |
| `portfolio` | **Étendu** : contient désormais demandes + projets, KPI consolidés |
| `project` | **Étendu** : origine (`demandId`), création directe restreinte |
| `finance` | **Étendu** : pipeline des budgets estimés des demandes |
| `document` | **Étendu** : pièces jointes rattachables à une demande |
| `search` | **Étendu** : indexation des demandes |
| `comment` | **Réutilisé tel quel** (déjà polymorphe `entityType`/`entityId`) |
| `core/notifications`, `core/audit` | **Réutilisés tels quels** (déjà génériques) |
| `budget-governance`, `quote` | **Inchangés** (voir §7, décision de non-migration) |

---

## 2. Impacts fonctionnels

1. **Le point d'entrée du cycle se déplace** : le flux standard démarre par une demande.
2. **La création directe de projet devient l'exception** : réservée aux administrateurs et
   pilotée par un réglage d'organisation (`allowDirectProjectCreation`).
3. **Le portefeuille devient le conteneur du pipeline** : demandes (avant-projet) +
   projets (après validation), avec consolidation des deux.
4. **La finance gagne une vue amont** : budgets *estimés* des demandes = pipeline, distinct
   des budgets *approuvés* des projets.
5. **Zéro double saisie** : tout ce qui est saisi sur la demande alimente le projet.
6. **Traçabilité** : le projet garde un lien permanent vers sa demande d'origine.

---

## 3. Évolutions de la base de données

Toutes les évolutions sont **additives**. Aucune colonne existante n'est supprimée.

### 3.1 Moteur de workflow (générique)

```
WorkflowDefinition   (organizationId, key, entityType, name, isDefault, version, active)
WorkflowState        (definitionId, key, label, kind: initial|intermediate|final_ok|final_ko, position)
WorkflowTransition   (definitionId, fromStateId, toStateId, key, label,
                      allowedRoles: Json, requiresComment, autoAction: Json?, position)
WorkflowInstance     (definitionId, entityType, entityId, currentStateId, startedAt, closedAt)
WorkflowTransitionLog(instanceId, transitionId, fromStateId, toStateId,
                      actorId, comment, createdAt)
```

`entityType` (`demand`, plus tard `project`, `risk`, …) rend le moteur réutilisable.
Les statuts vivent en base : **rien n'est codé en dur**.

### 3.2 Demand Management

```
Demand        (organizationId, reference DEM-00001, title, description, objectives,
               justification, requesterId, department, priority, urgency,
               estimatedBudget, estimatedDurationDays, targetPortfolioId?,
               qualifiedById?, estimatedWorkload?, projectId?  /* rempli à la conversion */,
               createdAt, updatedAt, deletedAt)
DemandTag     (demandId, label)                      -- filtrage simple
BusinessCase  (demandId unique, roi, costs, benefits, assumptions, resources,
               plannedStartDate, plannedEndDate, dependencies, createdById)
BusinessCaseRisk (businessCaseId, label, probability, impact, mitigation)
```

Le **statut** de la demande n'est pas une colonne enum : il est porté par
`WorkflowInstance.currentStateId`.

### 3.3 Registre des risques (à valider)

```
enum RiskStatus { open mitigated closed }
Risk (organizationId, projectId, label, description, probability, impact,
      severity /* calculé */, mitigation, ownerId?, status, sourceBusinessCaseRiskId?)
```

### 3.4 Extensions de modèles existants

| Modèle | Ajout | Compatibilité |
|---|---|---|
| `Project` | `demandId String? @unique` + relation | Nullable → projets existants intacts |
| `Portfolio` | relation inverse `demands Demand[]` | Aucun changement de colonne |
| `Document` | `projectId` passe en **nullable** + `demandId String?` | Les lignes existantes gardent leur `projectId` |
| `Organization` | `allowDirectProjectCreation Boolean @default(true)` | Défaut = comportement actuel |
| `RoleKey` | + `business_analyst` (+ `executive` si Direction ≠ admin) | Ajout de valeur d'enum, non destructif |

**Contrainte à poser sur `Document`** : exactement un parent (`projectId` XOR `demandId`),
vérifiée en service (MySQL ne supporte pas les CHECK complexes de façon portable).

---

## 4. Adaptations des API existantes

| Endpoint | Évolution |
|---|---|
| `POST /projects` | Refus si `allowDirectProjectCreation = false`, sinon réservé `admin` |
| `GET /projects/:id` | Expose `origin: { demandId, reference }` |
| `GET /portfolios/:id` | Ajoute la liste des demandes rattachées |
| `GET /portfolios/:id/finance` | Ajoute le **pipeline** (somme des budgets estimés des demandes non converties) |
| `GET /finance/portfolios` | Idem, colonne pipeline |
| `GET /search` | Indexe les demandes (titre, référence, description) |
| `GET /projects/:id/documents` | Inchangé ; les pièces reprises pointent désormais le projet |

### Nouveaux endpoints

```
GET    /demands                       liste filtrable (périmètre, portefeuille, état)
POST   /demands                       création (Collaborateur)
GET    /demands/:id                   détail + instance de workflow + transitions possibles
PATCH  /demands/:id                   modification (brouillon / retour pour complément)
DELETE /demands/:id                   corbeille
POST   /demands/:id/transitions/:key  franchir une transition (moteur)
GET    /demands/:id/business-case     lecture
PUT    /demands/:id/business-case     création / mise à jour (PMO, Business Analyst)
POST   /demands/:id/attachments       pièce jointe
GET    /demands/stats                 KPI (en attente, taux d'acceptation, délai moyen)

GET    /workflows                     définitions (administration)
PUT    /workflows/:key                configuration des états / transitions / rôles
```

---

## 5. Modifications des interfaces

- **Navigation principale** : le contrôle segmenté passe à trois entrées —
  *Projets · Demandes · Portefeuilles*.
- **Liste des demandes** : filtres (état, portefeuille, priorité, urgence), compteurs
  par onglet (même motif que le workspace projets).
- **Fiche demande** : en-tête + **indicateur d'étapes** réutilisant le langage visuel
  déjà en place (gouvernance budgétaire, devis) ; onglets *Détail · Business Case ·
  Pièces jointes · Discussion* (commentaires réutilisés) ; actions de transition
  affichées selon le rôle.
- **Fiche portefeuille** : nouvelle section *Demandes* + KPI pipeline.
- **Fiche projet** : bandeau « Issu de la demande **DEM-00007** » cliquable.
- **Dashboard** : demandes en attente, répartition par portefeuille, taux d'acceptation,
  délai moyen avant validation, projets issus de demandes.
- **Administration** : configuration du workflow + interrupteur « autoriser la création
  directe de projet ».
- i18n FR/EN systématique, design macOS et micro-animations existants réutilisés.

---

## 6. Migrations Prisma

Séquence ordonnée, chaque étape étant **réversible et non bloquante** :

1. `add_workflow_engine` — 5 tables du moteur.
2. `add_demand_management` — `Demand`, `DemandTag`, `BusinessCase`, `BusinessCaseRisk`.
3. `add_risk_register` — `Risk` + enum (si validé).
4. `extend_project_origin` — `Project.demandId` (nullable, unique).
5. `extend_document_scope` — `Document.project_id` **nullable** + `demand_id`.
6. `extend_organization_settings` — `allowDirectProjectCreation` défaut `true`.
7. `add_business_roles` — valeurs d'enum `RoleKey` + lignes `Role` correspondantes.
8. `seed_default_demand_workflow` — définition par défaut par organisation.

**Compatibilité** : aucun projet existant n'est modifié (`demandId` nul), aucune pièce
jointe n'est touchée (`projectId` conservé), le défaut du réglage préserve le
comportement actuel. Les 190 tests existants doivent rester verts à chaque étape.

---

## 7. Plan d'intégration progressif

Chaque lot = migration + module + tests d'intégration + vérification navigateur + commit,
selon le rythme déjà appliqué sur les lots P1→P4.

| Lot | Contenu | Risque |
|---|---|---|
| **D0** | Moteur de workflow générique (schéma, service, tests). Aucun impact fonctionnel visible | Faible |
| **D1** | Demandes : CRUD, référence `DEM-xxxxx`, rattachement portefeuille, tags, pièces jointes | Faible |
| **D2** | Branchement du workflow sur les demandes : transitions, rôles, notifications, historique | Moyen |
| **D3** | Business Case + risques identifiés | Faible |
| **D4** | **Conversion demande → projet** (nom, description, portefeuille, budget via gouvernance, chef de projet, documents, planning, risques, traçabilité) | Élevé |
| **D5** | Intégrations : dashboard, portefeuille, pipeline financier, recherche | Moyen |
| **D6** | Registre des risques projet | Moyen |
| **D7** | Restriction de la création directe + réglage d'organisation | Faible mais **visible** |

Le lot **D7 est volontairement placé en dernier** : tant que le flux par demande n'est pas
éprouvé, on ne coupe pas le chemin actuel de création de projet.

### Décision de non-migration

`budget-governance` et `quote` fonctionnent, sont testés et couverts. Les migrer vers le
nouveau moteur serait une réécriture sans bénéfice fonctionnel immédiat et un risque de
régression. **Proposition : les laisser en l'état**, le moteur étant conçu pour les
accueillir plus tard si le besoin se confirme.

---

## 8. Points à trancher avant implémentation

1. **Budget** — valider la proposition du §0 (approbation comité = acte de gouvernance,
   `BudgetRequest` approuvée générée à la conversion).
2. **Direction** — nouveau rôle `executive`, ou réutilisation d'`admin` ?
3. **Registre des risques** — le créer (lot D6) est nécessaire pour « transférer les
   risques initiaux ». À confirmer.
4. **Programmes** — hors périmètre proposé. À confirmer.
5. **Business Analyst** — nouveau rôle `business_analyst` : confirmé ?
6. **Tags** — texte libre (proposé) ou référentiel géré en administration ?
7. **Non-migration** de `budget-governance` / `quote` — validez-vous ?
