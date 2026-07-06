# 5. Structure des dépôts Git

## 5.1 Choix : monorepo unique

Un seul dépôt `openppm` (pnpm workspaces + Turborepo). Justification : types partagés front/back (fin des dérives d'API), refactorings atomiques cross-stack, une seule CI, un seul versioning produit. Les dépôts satellites (site vitrine, plugins communautaires) restent séparés.

```
openppm/
├── apps/
│   ├── web/                    # Next.js (frontend)
│   └── api/                    # NestJS (backend + workers)
├── packages/
│   ├── db/                     # schéma Prisma, migrations, seed, client généré
│   ├── types/                  # types & contrats partagés (générés OpenAPI + zod)
│   ├── ui/                     # design system (shadcn étendu, tokens macOS)
│   ├── gantt/                  # moteur Gantt (SVG virtualisé, CPM)
│   ├── i18n/                   # messages FR/EN/ES/DE + outillage
│   └── config/                 # eslint, tsconfig, tailwind, prettier partagés
├── infra/
│   ├── docker/                 # Dockerfiles + 3 docker-compose (modes 1/2/3)
│   ├── helm/openppm/           # chart Kubernetes
│   ├── nginx/  ├── apache/     # confs reverse proxy fournies
│   └── traefik/
├── scripts/                    # install.sh, backup.sh, restore.sh, migrate.sh, upgrade.sh
├── docs/                       # conception (ce dossier) + guides utilisateur/admin/dev
├── e2e/                        # tests Playwright cross-app
├── .github/workflows/          # ci.yml, security.yml, release.yml, docs.yml
├── turbo.json  pnpm-workspace.yaml  package.json
├── .env.example  CONTRIBUTING.md  SECURITY.md  LICENSE  CHANGELOG.md
```

## 5.2 Branches et flux

- **Trunk-based** : `main` toujours déployable, branches courtes `feat/…`, `fix/…`, `chore/…`, PR obligatoire avec CI verte + 1 review.
- Branches `release/x.y` uniquement pour les correctifs de versions maintenues.
- **Conventional Commits** (commitlint) → changelog et versions semver automatiques (release-please).
- Tags `vX.Y.Z` → build des images Docker multi-arch (GHCR), chart Helm, GitHub Release.

## 5.3 Protection et qualité

`main` protégée (CI + review requises, pas de force-push) ; CODEOWNERS par domaine (`apps/api/src/modules/finance/ @finance-maintainers`) ; hooks husky (lint-staged, commitlint) ; gitleaks en pré-merge.

## 5.4 Dépôts satellites (plus tard)

| Dépôt | Contenu |
|---|---|
| `openppm-website` | Site vitrine + documentation publique |
| `openppm-plugins` | SDK d'extension + plugins communautaires (post-v1.0) |
