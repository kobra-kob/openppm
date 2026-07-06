# 7. Plan de tests

Objectif : garantir qu'aucune fonctionnalité n'est « livrée » sans preuve automatisée qu'elle fonctionne — condition du « zéro mock, prêt pour la production ».

## 7.1 Pyramide et outillage

| Niveau | Outils | Cible | Quand |
|---|---|---|---|
| Unitaires | Vitest (web, packages), Jest (api) | Use cases, entités de domaine, calculs purs (CPM, criticité, scoring, burndown, agrégats financiers), composants UI isolés (Testing Library) | Chaque PR, < 2 min |
| Intégration API | Jest + Supertest + **Testcontainers** (MySQL 8.4 + Redis réels) | Controllers→BDD réelle : contrats REST/GraphQL, RBAC/permissions, isolation multi-tenant, transactions, migrations | Chaque PR |
| E2E | Playwright (Chromium + Firefox, mobile viewport) | Parcours critiques complets sur l'app buildée + BDD seedée | Chaque PR (suite smoke) + nightly (suite complète) |
| Performance | k6 | P95 API < 300 ms sur les endpoints chauds ; scénario 500 VU (Enterprise) ; Gantt 5 000 tâches fluide | Nightly + avant release |
| Sécurité | OWASP ZAP baseline, CodeQL, Trivy, gitleaks, npm audit | Top 10, secrets, images, dépendances | PR (statique) + hebdo (dynamique) |
| Accessibilité | axe-core dans Playwright | WCAG 2.1 AA sur les écrans principaux | Nightly |

## 7.2 Règles de couverture

- Domaine + application (use cases) : **≥ 90 %** lignes/branches — c'est là que vit la logique métier.
- Global backend : ≥ 80 %. Front (features) : ≥ 70 %. Seuils bloquants en CI, jamais abaissés pour « faire passer ».
- Tout bug corrigé arrive **avec** son test de non-régression.
- Les calculs sensibles (chemin critique, charge/capacité, totaux devis avec remises/TVA, rollup budgétaire, vélocité) ont des jeux de cas limites explicites (dépendances circulaires, calendriers avec fériés, arrondis monétaires — calculs en centimes/`Decimal`, jamais en flottants).

## 7.3 Scénarios E2E critiques (suite smoke, bloquante en PR)

1. Inscription → création d'organisation → invitation d'un membre → connexion du membre (rôle Employé).
2. Login + 2FA TOTP ; mot de passe oublié de bout en bout (email intercepté par MailHog).
3. Créer un projet depuis un template → ajouter des tâches avec dépendances → les voir dans le Gantt → déplacer une tâche (drag) → vérifier le recalcul des successeurs.
4. Board Kanban : drag & drop entre colonnes, respect du WIP, mise à jour temps réel sur un second navigateur (WebSocket).
5. Saisie de temps → coût réel visible dans le budget projet → dérive reflétée dans la santé.
6. Devis : création → soumission → approbation niveau 1 puis 2 → génération PDF → refus avec motif sur une v2.
7. Risque : création (P×I), plan de mitigation, apparition dans la matrice et le dashboard.
8. Sprint : planification depuis le backlog → burndown mis à jour après clôture de stories.
9. RBAC : un Observateur ne peut pas modifier ; un Invité ne voit que ses projets ; isolation inter-organisations vérifiée (tentative d'accès direct par ID → 404).
10. Rapport programmé : définition → exécution planifiée → email avec PDF joint.
11. i18n : parcours clé en FR et EN, vérification qu'aucune clé brute ne s'affiche.
12. Corbeille : suppression → restauration → purge.

## 7.4 Tests d'infrastructure

- Les 3 modes Docker Compose démarrent en CI (`docker compose config` + boot + healthchecks verts + smoke HTTP).
- `helm template` + `helm lint` + déploiement kind en nightly.
- Migration : base seedée en vN → `prisma migrate deploy` vN+1 → suite d'intégration verte (garantie d'upgrade sans perte).
- `backup.sh` puis `restore.sh` → intégrité vérifiée (checksums + comptages).

## 7.5 Environnements et données

- **PR** : services éphémères (Testcontainers / services GitHub Actions), seed déterministe.
- **Nightly/staging** : environnement déployé par compose, jeu de données réaliste généré (faker seedé : 3 organisations, 40 projets, 5 000 tâches) pour E2E complet, perf et a11y.
- Jamais de données personnelles réelles dans les jeux de test.

## 7.6 Definition of Done (chaque fonctionnalité)

1. Use cases couverts par tests unitaires (cas nominaux + limites + erreurs).
2. Endpoints couverts en intégration (succès, validation, permissions, tenant).
3. Parcours UI couvert en E2E si critique, sinon test de composant.
4. Swagger à jour (généré), i18n complet (4 langues), audit trail émis, notifications branchées.
5. Documentation utilisateur mise à jour.
6. CI verte, review approuvée, aucune régression de couverture.
