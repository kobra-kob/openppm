# OpenPPM — Strategic Portfolio Management Open Source

> Alternative Open Source de niveau Enterprise à **ServiceNow Strategic Portfolio Management**.
> Nom de code provisoire : **OpenPPM** (renommable avant publication).

OpenPPM est une plateforme complète de gestion de portefeuilles, programmes, projets, ressources, finances et risques, pensée comme un véritable produit commercial : modulaire, testée, documentée, sécurisée, déployable en Docker/Kubernetes.

## Stack

| Couche | Technologies |
|---|---|
| Frontend | Next.js (React 19, App Router), TypeScript, TailwindCSS, shadcn/ui, TanStack Query, Zustand, Lucide |
| Backend | NestJS, TypeScript, REST + GraphQL + WebSocket, Swagger/OpenAPI |
| Base de données | MySQL 8.4 + Prisma ORM |
| Cache / Jobs | Redis + BullMQ |
| Auth | JWT + Refresh rotation, RBAC (CASL), 2FA TOTP, OAuth2/OIDC, SAML, LDAP/AD |
| Infra | Docker Compose (3 modes), Kubernetes + Helm, Traefik/Nginx/Apache, Let's Encrypt |
| CI/CD | GitHub Actions (lint, tests, build, images, releases) |

## Documentation de conception

La conception complète est produite **avant l'implémentation** :

1. [Architecture complète](docs/01-architecture.md) — frontend, backend, BDD, infra, Docker, CI/CD
2. [Schéma de base de données (ERD)](docs/02-database-erd.md) — modèle de données par domaine
3. [Modules et relations](docs/03-modules.md) — liste exhaustive + graphe de dépendances
4. [Wireframes](docs/04-wireframes.md) — principales interfaces (design macOS-like)
5. [Structure des dépôts Git](docs/05-git-structure.md) — monorepo, conventions, branches
6. [Roadmap](docs/06-roadmap.md) — MVP → v1.0 → Enterprise
7. [Plan de tests](docs/07-test-plan.md) — unitaires, intégration, E2E, performance, sécurité

## Principes non négociables

- **Aucun mock en production** : chaque fonctionnalité livrée est terminée, testée, documentée.
- **Clean Architecture / DDD / SOLID** côté backend (domaines isolés, Repository Pattern, DTO validés).
- **API-first** : toute fonctionnalité UI existe d'abord en API REST (+ GraphQL), documentée Swagger.
- **Multi-tenant ready** : isolation par organisation dès le schéma de données.
- **i18n natif** : FR, EN, ES, DE — aucune chaîne en dur.
- **Sécurité OWASP Top 10** : CSRF, XSS, rate limiting, audit trail complet.
- **UX macOS-like** : minimalisme, glassmorphism, sidebar type Finder, dark/light mode, animations fluides.

## Démarrage rapide (cible)

```bash
git clone https://github.com/<org>/openppm.git
cd openppm
cp .env.example .env
docker compose up -d        # Mode 1 : tout-en-un (front + back + MySQL + Redis)
# → http://localhost:3000
```

## Déploiement serveur (Debian / Ubuntu)

Installation en quelques clics sur un serveur — Docker, secrets, **base de
données incluse** — via les scripts de `infra/deploy/` :

```bash
git clone <votre-repo>.git openppm && cd openppm
sudo ./infra/deploy/install.sh --app-url http://mon-serveur:3000
```

Mise à jour : `sudo ./infra/deploy/update.sh` · Sauvegarde BDD :
`sudo ./infra/deploy/backup.sh` · Désinstallation : `sudo ./infra/deploy/uninstall.sh`
(`--purge` pour tout effacer). Guide complet : [infra/deploy/README.md](infra/deploy/README.md).

## Licence

AGPL-3.0 (cœur) — garantit que les forks SaaS restent ouverts. Modules « enterprise » optionnels possibles sous licence commerciale (modèle open-core), à décider avant v1.0.
