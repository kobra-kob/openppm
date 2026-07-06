# 4. Wireframes des principales interfaces

Design system : inspiration macOS — sidebar type Finder (translucide, `backdrop-blur`), coins arrondis 10–14 px, glassmorphism sur les panneaux flottants, typographie Inter, icônes Lucide, dark/light mode, animations 150–250 ms (spring). Densité maîtrisée : beaucoup d'air, hiérarchie par la graisse plutôt que par les bordures.

## 4.1 Shell applicatif (toutes pages)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⌘ OpenPPM   [🔍 Recherche globale…  ⌘K]                    🔔3  🌙  [LO ▾]  │ ← topbar verre
├───────────────┬──────────────────────────────────────────────────────────────┤
│ FAVORIS       │                                                              │
│  ⭐ Refonte SI │                                                              │
│               │                                                              │
│ PILOTAGE      │                                                              │
│  ◧ Dashboard  │                                                              │
│  ▦ Portfolios │                      ZONE DE CONTENU                         │
│  ▤ Programmes │             (routée, transitions animées)                    │
│  ▣ Projets    │                                                              │
│  ⧖ Roadmap    │                                                              │
│               │                                                              │
│ OPÉRATIONS    │                                                              │
│  ☑ Mes tâches │                                                              │
│  ⏱ Temps      │                                                              │
│  ⛰ Ressources │                                                              │
│  ⚠ Risques    │                                                              │
│  💰 Finances  │  📄 Devis   💡 Demandes   📁 Documents   📊 Rapports          │
│               │                                                              │
│ ⚙ Admin       │                                                              │
└───────────────┴──────────────────────────────────────────────────────────────┘
Sidebar translucide, sections repliables (comme Finder), items avec pastille compteur.
⌘K = palette de commandes (navigation + actions + recherche).
```

## 4.2 Dashboard exécutif (vue globale personnalisable)

```
┌ Dashboard exécutif ──────────────────── [+ Widget] [Éditer la grille] [⋯] ──┐
│ ┌ KPI ─────┐ ┌ KPI ─────┐ ┌ KPI ─────┐ ┌ KPI ──────┐ ┌ KPI ───────────┐    │
│ │ 48       │ │ 12,4 M€  │ │ 7        │ │ 83 %      │ │ 5 risques      │    │
│ │ projets  │ │ budget   │ │ en retard│ │ capacité  │ │ critiques      │    │
│ └──────────┘ └──────────┘ └──────────┘ └───────────┘ └────────────────┘    │
│ ┌ Santé des projets (par portfolio) ──────┐ ┌ Budget vs Réel (line) ─────┐ │
│ │ Digital     ████████░░  🟢24 🟠3 🔴1    │ │      ╭─╮  réel             │ │
│ │ Infra       ██████░░░░  🟢12 🟠4 🔴2    │ │  ╭───╯ ╰──── budget        │ │
│ │ R&D         ████░░░░░░  🟢6  🟠1 🔴0    │ │ ─╯                J F M A M │ │
│ └─────────────────────────────────────────┘ └────────────────────────────┘ │
│ ┌ Charge par équipe (heatmap) ────────────┐ ┌ Jalons à venir (liste) ────┐ │
│ │        S27 S28 S29 S30 S31              │ │ ◆ 12/07 Go-live CRM   🟠   │ │
│ │ Dev    ▓▓  ▓▓  ██  ██  ░░   (██ >100%)  │ │ ◆ 19/07 Recette ERP   🟢   │ │
│ │ Infra  ░░  ▓▓  ▓▓  ░░  ░░               │ │ ◆ 02/08 Audit sécu    🔴   │ │
│ └─────────────────────────────────────────┘ └────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
Grille drag & drop (12 colonnes), chaque widget : source + filtres + seuils configurables.
```

## 4.3 Portfolio — priorisation et roadmap

```
┌ Portfolio : Transformation digitale ─────────── [Objectifs] [Budget] [⋯] ──┐
│ Onglets:  Vue d'ensemble │ Projets │ Roadmap │ Capacité │ Finances │ Risques │
│ ┌ Bulle valeur/effort ────────────┐ ┌ Scoring (priorisation) ────────────┐ │
│ │ valeur ▲   ◯CRM                 │ │ #  Projet      Valeur Risque Score │ │
│ │        │ ◯ERP      ◯Data        │ │ 1  CRM v2        8      2     92  │ │
│ │        │      ◯Intranet         │ │ 2  Data lake     7      3     78  │ │
│ │        └──────────────► effort  │ │ 3  Intranet      5      2     61  │ │
│ └─────────────────────────────────┘ └────────────────────────────────────┘ │
│ ┌ Roadmap (trimestres) ────────────────────────────────────────────────── ┐ │
│ │        T3 2026        T4 2026        T1 2027        T2 2027            │ │
│ │ CRM    ▓▓▓▓▓▓▓▓▓▓◆                                                     │ │
│ │ ERP         ▓▓▓▓▓▓▓▓▓▓▓▓▓▓◆                                            │ │
│ │ Data                  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓◆                              │ │
│ └──────────────────────────────────────────────────────────────────────── ┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 4.4 Projet — vue d'ensemble

```
┌ ▣ CRM v2   🟢 En bonne santé   Workflow: [En cours ▾]   👥 8   ⭐ ──────────┐
│ Onglets: Aperçu │ Gantt │ Board │ Backlog │ Tâches │ Finances │ Risques │    │
│          Documents │ Activité │ Paramètres                                   │
│ ┌ Avancement ──────┐ ┌ Budget ──────────┐ ┌ Planning ───────┐ ┌ Risques ──┐ │
│ │   ◔ 64 %         │ │ 340 k€ / 500 k€  │ │ Fin: 12/11/2026 │ │ 🔴1 🟠3   │ │
│ │   128/200 tâches │ │ ▓▓▓▓▓▓▓░░░ CAPEX │ │ Dérive: +6 j    │ │ 2 actions │ │
│ └──────────────────┘ └──────────────────┘ └─────────────────┘ └───────────┘ │
│ ┌ Jalons ────────────────────────────┐ ┌ Activité récente ────────────────┐ │
│ │ ◆ Cadrage        ✅ 02/05          │ │ ● Marie a clôturé « Spec API »   │ │
│ │ ◆ MVP interne    🟠 15/08 (+6 j)   │ │ ● Budget T3 approuvé (workflow)  │ │
│ │ ◆ Go-live        ⬜ 12/11          │ │ ● Nouveau risque « RGPD » ajouté │ │
│ └────────────────────────────────────┘ └──────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 4.5 Gantt interactif

```
┌ Gantt — CRM v2   [Jour|Semaine|Mois|Année] [⛓ Chemin critique] [Baseline ▾] │
│ [🔍 filtre…] [+ Tâche] [Exporter: PDF PNG XLSX]                    zoom ─●──┤
├────────────────────────┬─────────────────────────────────────────────────────┤
│ WBS  Tâche      Resp.  │ Juil        Août        Sept        Oct            │
│ ▾ 1  Cadrage    ML     │ ▓▓▓▓▓▓                                             │
│   1.1 Ateliers  ML     │ ▓▓▓╗                                               │
│   1.2 Spec      JD     │    ╚═▓▓▓▓╗        ← dépendance FS (drag pour lier) │
│ ▾ 2  Build      équipe │          ╚═████████████████░░░░  ← critique (rouge)│
│   2.1 API       JD     │           ████████▁▁▁▁ ← baseline (ombre grise)    │
│   2.2 Front     SB     │               ████████████                         │
│ ◆ 3  MVP        —      │                        ◆ 15/08                     │
├────────────────────────┼─────────────────────────────────────────────────────┤
│ Charge (h/j)           │ ▂▄▆█▆▄▂  ← histogramme de charge sous la timeline  │
└────────────────────────┴─────────────────────────────────────────────────────┘
Interactions : drag = déplacer, poignées = redimensionner, drag entre barres = créer
dépendance, double-clic = panneau détail (glass, slide-over droite). Virtualisation
verticale ; annuler/refaire (⌘Z).
```

## 4.6 Kanban

```
┌ Board — CRM v2   [Swimlanes: Épic ▾] [Filtres: @moi, priorité ▾] [⚙ colonnes]│
│ ┌ À faire (12) ──┐ ┌ En cours (5/6 WIP)┐ ┌ Revue (3) ─┐ ┌ Terminé (48) ───┐ │
│ │ ╔═ Épic: Auth ═╪═══════════════════════════════════════════════════════╗ │
│ │ ║┌───────────┐ │ ┌───────────┐      │             │ ┌───────────┐      ║ │
│ │ ║│ US-42     │ │ │ US-38  🔴 │      │             │ │ US-31     │      ║ │
│ │ ║│ Login SSO │ │ │ 2FA TOTP  │      │             │ │ Session   │      ║ │
│ │ ║│ 5pts 👤JD │ │ │ 8pts 👤ML │      │             │ │ 3pts ✅   │      ║ │
│ │ ║└───────────┘ │ └───────────┘      │             │ └───────────┘      ║ │
│ │ ╚══════════════╪════════════════════╪═════════════╪════════════════════╝ │
│ │ ╔═ Épic: API ══╪═══ …                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
Drag & drop fluide (animation spring), limite WIP en surbrillance si dépassée,
carte = titre, points, priorité, avatar, tags, compteur checklist/commentaires.
```

## 4.7 Backlog & Sprint (Scrum)

```
┌ Backlog — CRM v2      [+ Story] [⚡ Planifier le sprint]                     │
│ ┌ Sprint 14 (04/07 → 18/07) — 34/40 pts ── [Démarrer] ─┐ ┌ Burndown ──────┐ │
│ │ ≡ US-38  2FA TOTP                 8pts  👤ML  🔴     │ │ pts╲            │ │
│ │ ≡ US-42  Login SSO                5pts  👤JD         │ │    ╲╲__ idéal   │ │
│ │ ≡ US-44  Rate limiting            3pts  —            │ │     ╲__╲_ réel  │ │
│ └───────────────────────────────────────────────────────┘ │         j      │ │
│ ┌ Backlog (ranké, drag pour prioriser) ─────────────────┐ └────────────────┘ │
│ │ ≡ US-47  Import LDAP              13pts   Épic: Auth  │  Vélocité: 32 ▂▄▆ │
│ │ ≡ US-51  Audit trail UI           5pts    Épic: Admin │                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 4.8 Ressources — plan de charge

```
┌ Ressources   [Équipe ▾] [Compétence ▾] [Juil ◀ ▶]        [+ Affectation]    │
│                 S28      S29      S30      S31      S32                      │
│ 👤 J. Dupont    ████ 90% ████100% ██████120%🔴 ██ 40%  ▒▒ congés            │
│    └ CRM v2     24h      32h      36h      16h                              │
│    └ Data lake  12h      8h       12h      —                                │
│ 👤 M. Leroy     ██ 50%   ████ 95% ████ 95% ████ 95%   ████ 95%              │
│ 👤 S. Bernard   ▒▒▒▒ congés ▒▒▒▒  ██ 60%   ████ 90%   ████ 90%              │
├──────────────────────────────────────────────────────────────────────────────┤
│ Capacité équipe: 420 h │ Affecté: 386 h │ Dispo: 34 h │ Surcharge: J.Dupont │
└──────────────────────────────────────────────────────────────────────────────┘
Clic sur une cellule = détail des affectations, drag pour rééquilibrer.
```

## 4.9 Registre des risques

```
┌ Risques — CRM v2   [+ Risque] [Matrice] [Export]                            │
│ ┌ Matrice P×I ────────┐  ID   Risque              P  I  Crit  Statut  Resp. │
│ │ P5 ░ ░ ▓ █ █        │  R-12 Fuite données RGPD  4  5  🔴20  Mitigation ML │
│ │ P4 ░ ░ ▓ ▓ █ ← R-12 │  R-08 Départ dev senior   3  4  🟠12  Évalué     JD │
│ │ P3 ░ ░ ▓ ▓ ▓        │  R-15 Retard licence      2  3  🟡 6  Identifié  SB │
│ │ P2 ░ ░ ░ ▓ ▓        │  ── panneau latéral au clic : description, plan de  │
│ │ P1 ░ ░ ░ ░ ▓        │     mitigation, responsable, échéance, historique,  │
│ │    I1 I2 I3 I4 I5   │     commentaires, workflow de validation ──         │
│ └─────────────────────┘                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 4.10 Devis — éditeur et workflow

```
┌ Devis Q-2026-0042 — v3   [Statut: En validation 2/3]   [PDF] [Historique ▾] │
│ Client: ACME SAS          Validité: 31/08/2026        Projet lié: CRM v2    │
│ ┌ Lignes ──────────────────────────────────────────────────────────────────┐│
│ │ #  Désignation              Qté   Unité   PU HT     Remise   Total HT    ││
│ │ 1  Développement backend    45    j/h     650 €     5 %      27 787 €    ││
│ │ 2  Licences an 1            1     forfait 12 000 €  —        12 000 €    ││
│ │ [+ ligne]                              Total HT 39 787 € · TTC 47 744 €  ││
│ └──────────────────────────────────────────────────────────────────────────┘│
│ ┌ Circuit de validation ───────────────────────────────────────────────────┐│
│ │ ① Chef de projet ✅ 02/07 → ② Direction financière ⏳ → ③ Direction ⬜   ││
│ │                            [✅ Approuver] [❌ Refuser + motif]            ││
│ └──────────────────────────────────────────────────────────────────────────┘│
│ Versions: v1 (refusée) · v2 (expirée) · v3 (courante)   Signature: en ligne │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 4.11 Administration

```
┌ Admin ── Utilisateurs │ Rôles │ Groupes │ SSO │ Workflows │ Champs perso │   │
│         Modules │ Audit │ Organisation                                       │
│ Ex. onglet Workflows : éditeur visuel d'états (nœuds) et transitions         │
│ (flèches), conditions par règle (champ/opérateur/valeur), actions (notifier, │
│ affecter, démarrer une approbation, webhook). Test à blanc avant publication.│
└──────────────────────────────────────────────────────────────────────────────┘
```

## 4.12 Authentification

```
┌──────────── fond dégradé + blur ────────────┐   Étapes suivantes selon config:
│         ⌘ OpenPPM                           │   • 2FA : saisie code TOTP
│   ┌ carte verre ────────────────┐           │   • SSO : boutons par provider
│   │  Email     [______________] │           │     (« Continuer avec Okta… »)
│   │  Mot de p. [______________] │           │   • Mot de passe oublié → email
│   │  [ Se connecter ]           │           │     avec lien à durée limitée
│   │  ── ou ──  [SSO Entreprise] │           │
│   └─────────────────────────────┘           │
└─────────────────────────────────────────────┘
```
