# 2. Schéma de base de données (ERD)

Conventions : UUID v7 en PK, `organization_id` sur toute table métier (multi-tenant), `created_at` / `updated_at` / `deleted_at` (soft delete), `snake_case`. Les diagrammes ci-dessous montrent les colonnes structurantes, pas l'exhaustivité (le schéma Prisma fait foi : `packages/db/prisma/schema.prisma`).

## 2.1 Identité, accès, organisation

```mermaid
erDiagram
    organizations ||--o{ users : "emploie"
    organizations ||--o{ roles : ""
    users ||--o{ user_roles : ""
    roles ||--o{ user_roles : ""
    roles ||--o{ role_permissions : ""
    permissions ||--o{ role_permissions : ""
    organizations ||--o{ groups : ""
    groups ||--o{ group_members : ""
    users ||--o{ group_members : ""
    users ||--o{ sessions : ""
    users ||--o{ refresh_tokens : ""
    users ||--o{ user_identities : "SSO"
    organizations ||--o{ auth_providers : "OIDC/SAML/LDAP"
    auth_providers ||--o{ user_identities : ""
    users ||--o{ audit_logs : "acteur"

    organizations { uuid id PK string name string slug UK json settings string plan }
    users { uuid id PK uuid organization_id FK string email UK string password_hash string first_name string last_name string locale string timezone bool is_active bool mfa_enabled string mfa_secret datetime last_login_at }
    roles { uuid id PK uuid organization_id FK string name string key bool is_system }
    permissions { uuid id PK string action string subject json conditions }
    refresh_tokens { uuid id PK uuid user_id FK string token_hash UK uuid family_id datetime expires_at datetime revoked_at string ip string user_agent }
    auth_providers { uuid id PK uuid organization_id FK enum type "oidc|oauth2|saml|ldap" string name json config bool jit_provisioning json group_mapping }
    audit_logs { uuid id PK uuid organization_id FK uuid user_id FK string action string entity_type uuid entity_id json before json after string ip datetime created_at }
```

## 2.2 Portfolio, programmes, projets

```mermaid
erDiagram
    portfolios ||--o{ programs : "contient"
    portfolios ||--o{ projects : "directement ou via programme"
    programs ||--o{ programs : "sous-programmes"
    programs ||--o{ projects : ""
    portfolios ||--o{ portfolio_goals : "objectifs/OKR"
    portfolio_goals ||--o{ key_results : ""
    projects ||--o{ project_members : ""
    users ||--o{ project_members : ""
    project_templates ||--o{ projects : "instancie"
    projects ||--o{ project_baselines : ""
    projects ||--o{ milestones : ""
    projects ||--o{ project_status_reports : "santé"

    portfolios { uuid id PK uuid organization_id FK string name uuid owner_id FK decimal budget enum status int priority_score json kpi_targets }
    programs { uuid id PK uuid portfolio_id FK uuid parent_id FK string name uuid owner_id FK date start_date date end_date enum status }
    projects { uuid id PK uuid organization_id FK uuid portfolio_id FK uuid program_id FK string code UK string name text description enum methodology "waterfall|agile|hybrid" enum status uuid workflow_state_id FK enum health "green|amber|red" int priority date start_date date end_date decimal budget uuid manager_id FK uuid template_id FK int version }
    project_members { uuid id PK uuid project_id FK uuid user_id FK enum role "manager|member|observer" decimal allocation_pct }
    project_baselines { uuid id PK uuid project_id FK string name datetime captured_at json snapshot "dates+efforts des tâches" }
    milestones { uuid id PK uuid project_id FK string name date due_date enum status bool is_billing_point }
    project_status_reports { uuid id PK uuid project_id FK enum health text summary json kpis datetime reported_at uuid author_id FK }
```

## 2.3 Tâches, planning, Agile

Une seule table `tasks` porte tous les types d'éléments de travail (epic, story, task, bug, subtask via `parent_id`) — évite les jointures polymorphes et simplifie Gantt/board/backlog.

```mermaid
erDiagram
    projects ||--o{ tasks : ""
    tasks ||--o{ tasks : "sous-tâches (parent_id)"
    tasks ||--o{ task_dependencies : "prédécesseur/successeur"
    tasks ||--o{ task_assignees : ""
    users ||--o{ task_assignees : ""
    tasks ||--o{ checklist_items : ""
    tasks ||--o{ time_entries : ""
    projects ||--o{ sprints : ""
    sprints ||--o{ tasks : "sprint_id"
    projects ||--o{ boards : ""
    boards ||--o{ board_columns : ""
    boards ||--o{ board_swimlanes : ""
    projects ||--o{ releases : ""
    releases ||--o{ tasks : "release_id"

    tasks { uuid id PK uuid project_id FK uuid parent_id FK enum type "epic|story|task|bug|milestone" string title text description enum status enum priority uuid sprint_id FK uuid release_id FK uuid column_id FK uuid swimlane_id FK decimal estimate_hours decimal story_points date start_date date due_date int progress_pct string rank "lexorank backlog/board" int version }
    task_dependencies { uuid id PK uuid predecessor_id FK uuid successor_id FK enum type "FS|SS|FF|SF" int lag_days }
    time_entries { uuid id PK uuid task_id FK uuid user_id FK date spent_on decimal hours text note bool billable decimal cost_rate }
    sprints { uuid id PK uuid project_id FK string name date start_date date end_date enum status text goal decimal velocity }
    board_columns { uuid id PK uuid board_id FK string name int position int wip_limit enum maps_to_status }
```

## 2.4 Finances et devis

```mermaid
erDiagram
    projects ||--o{ budgets : ""
    portfolios ||--o{ budgets : ""
    budgets ||--o{ budget_lines : ""
    cost_centers ||--o{ budget_lines : ""
    projects ||--o{ cost_entries : "réel"
    projects ||--o{ forecasts : ""
    projects ||--o{ contracts : ""
    contracts ||--o{ purchase_orders : ""
    projects ||--o{ quotes : ""
    quotes ||--o{ quote_versions : ""
    quote_versions ||--o{ quote_lines : ""
    quotes ||--o{ approval_requests : "validation multi-niveaux"

    budgets { uuid id PK uuid organization_id FK uuid project_id FK uuid portfolio_id FK string name string fiscal_year enum status decimal total_amount string currency }
    budget_lines { uuid id PK uuid budget_id FK uuid cost_center_id FK enum type "capex|opex" string label decimal amount date period }
    cost_entries { uuid id PK uuid project_id FK uuid budget_line_id FK uuid task_id FK enum type "capex|opex" enum source "manual|timesheet|po|invoice" string label decimal amount date incurred_on }
    forecasts { uuid id PK uuid project_id FK date period decimal forecast_amount decimal actual_amount text assumptions }
    quotes { uuid id PK uuid organization_id FK uuid project_id FK string number UK string customer_name enum status "draft|submitted|approved|rejected|signed|expired" uuid current_version_id date valid_until }
    quote_versions { uuid id PK uuid quote_id FK int version decimal total_ht decimal total_ttc decimal tax_rate text terms string pdf_path string signature_data datetime signed_at }
    quote_lines { uuid id PK uuid quote_version_id FK int position string label decimal quantity string unit decimal unit_price decimal discount_pct }
```

## 2.5 Ressources et capacité

```mermaid
erDiagram
    users ||--o{ resource_profiles : "1-1"
    resource_profiles ||--o{ user_skills : ""
    skills ||--o{ user_skills : ""
    calendars ||--o{ resource_profiles : "calendrier de travail"
    calendars ||--o{ calendar_exceptions : "fériés, fermetures"
    users ||--o{ leaves : "congés"
    projects ||--o{ allocations : ""
    users ||--o{ allocations : ""

    resource_profiles { uuid id PK uuid user_id FK uuid calendar_id FK decimal capacity_hours_per_day decimal hourly_cost decimal billing_rate string job_title date available_from }
    skills { uuid id PK uuid organization_id FK string name string category }
    user_skills { uuid id PK uuid user_id FK uuid skill_id FK int level "1-5" }
    calendars { uuid id PK uuid organization_id FK string name json working_days "lun-ven 7h..." }
    leaves { uuid id PK uuid user_id FK enum type date start_date date end_date decimal hours enum status "requested|approved|rejected" uuid approved_by FK }
    allocations { uuid id PK uuid user_id FK uuid project_id FK uuid task_id FK date start_date date end_date decimal hours_per_day decimal allocation_pct enum status "soft|hard" }
```

## 2.6 Risques, problèmes, demandes

```mermaid
erDiagram
    projects ||--o{ risks : ""
    portfolios ||--o{ risks : ""
    risks ||--o{ risk_responses : "mitigation"
    projects ||--o{ issues : ""
    issues ||--o{ actions : ""
    risks ||--o{ actions : ""
    organizations ||--o{ demands : "idées / requêtes"
    demands ||--o{ projects : "convertie en"

    risks { uuid id PK uuid organization_id FK uuid project_id FK uuid portfolio_id FK string title text description enum category int probability "1-5" int impact "1-5" int criticality "calculé p*i" enum status "identified|assessed|mitigating|closed|occurred" uuid owner_id FK date review_date }
    risk_responses { uuid id PK uuid risk_id FK enum strategy "avoid|mitigate|transfer|accept" text plan uuid owner_id FK date due_date enum status }
    issues { uuid id PK uuid project_id FK string title text description enum severity enum status uuid owner_id FK date due_date int escalation_level datetime escalated_at }
    actions { uuid id PK uuid organization_id FK uuid issue_id FK uuid risk_id FK string title uuid assignee_id FK date due_date enum status }
    demands { uuid id PK uuid organization_id FK string title text description enum category decimal estimated_cost decimal estimated_benefit int score uuid workflow_state_id FK uuid requester_id FK uuid converted_project_id FK }
```

## 2.7 Workflow, approbations, automatisation

```mermaid
erDiagram
    workflows ||--o{ workflow_states : ""
    workflows ||--o{ workflow_transitions : ""
    workflow_states ||--o{ workflow_transitions : "from/to"
    workflow_transitions ||--o{ workflow_rules : "conditions + actions"
    approval_requests ||--o{ approval_steps : "multi-niveaux"
    users ||--o{ approval_steps : "approbateur"

    workflows { uuid id PK uuid organization_id FK string name enum entity_type "project|demand|quote|risk|document|leave" bool is_default int version }
    workflow_states { uuid id PK uuid workflow_id FK string name string color enum category "todo|in_progress|done|cancelled" int position bool is_initial }
    workflow_transitions { uuid id PK uuid workflow_id FK uuid from_state_id FK uuid to_state_id FK string name json required_permissions bool requires_approval }
    workflow_rules { uuid id PK uuid transition_id FK json conditions "champ/opérateur/valeur" json actions "notify|assign|set_field|start_approval|webhook" }
    approval_requests { uuid id PK uuid organization_id FK string entity_type uuid entity_id enum status int current_step uuid requested_by FK }
    approval_steps { uuid id PK uuid approval_request_id FK int step_order uuid approver_id FK uuid approver_group_id FK enum status "pending|approved|rejected" text comment datetime decided_at }
```

## 2.8 Transverse : documents, commentaires, tags, dashboards, notifications

```mermaid
erDiagram
    folders ||--o{ folders : "arborescence"
    folders ||--o{ documents : ""
    documents ||--o{ document_versions : ""
    dashboards ||--o{ dashboard_widgets : ""
    reports ||--o{ report_schedules : ""
    custom_fields ||--o{ custom_field_values : ""

    documents { uuid id PK uuid organization_id FK uuid folder_id FK string entity_type uuid entity_id string name uuid current_version_id json permissions }
    document_versions { uuid id PK uuid document_id FK int version string storage_path string mime_type bigint size string checksum uuid uploaded_by FK }
    comments { uuid id PK uuid organization_id FK string entity_type uuid entity_id uuid author_id FK text body uuid parent_id FK json mentions }
    attachments { uuid id PK string entity_type uuid entity_id string storage_path string filename string mime_type bigint size }
    tags { uuid id PK uuid organization_id FK string name string color }
    taggables { uuid tag_id FK string entity_type uuid entity_id }
    favorites { uuid user_id FK string entity_type uuid entity_id }
    activities { uuid id PK uuid organization_id FK string entity_type uuid entity_id uuid actor_id FK string verb json payload datetime created_at }
    notifications { uuid id PK uuid user_id FK string type json payload enum channel "inapp|email|push" datetime read_at datetime sent_at }
    dashboards { uuid id PK uuid organization_id FK uuid owner_id FK string name enum scope "personal|project|portfolio|executive" bool is_default json layout }
    dashboard_widgets { uuid id PK uuid dashboard_id FK enum type "kpi|pie|bar|line|heatmap|table|calendar|list|notifications" string title json config "source, filtres, seuils" json position "x,y,w,h" }
    reports { uuid id PK uuid organization_id FK string name enum entity_type json definition "colonnes, filtres, groupements" uuid owner_id FK }
    report_schedules { uuid id PK uuid report_id FK string cron enum format "pdf|xlsx|csv" json recipients datetime last_run_at }
    custom_fields { uuid id PK uuid organization_id FK enum entity_type string name enum field_type "text|number|date|select|multiselect|user|bool" json options bool required }
    custom_field_values { uuid id PK uuid custom_field_id FK uuid entity_id json value }
```

## 2.9 Inventaire des tables (≈ 60)

| Domaine | Tables |
|---|---|
| Identité / accès | organizations, users, roles, permissions, role_permissions, user_roles, groups, group_members, sessions, refresh_tokens, password_resets, auth_providers, user_identities, audit_logs |
| Portfolio / projets | portfolios, portfolio_goals, key_results, programs, projects, project_templates, project_members, project_baselines, project_status_reports, milestones |
| Travail / Agile | tasks, task_dependencies, task_assignees, checklist_items, time_entries, sprints, releases, boards, board_columns, board_swimlanes |
| Finances | budgets, budget_lines, cost_centers, cost_entries, forecasts, contracts, purchase_orders, quotes, quote_versions, quote_lines |
| Ressources | resource_profiles, skills, user_skills, calendars, calendar_exceptions, leaves, allocations |
| Risques / demandes | risks, risk_responses, issues, actions, demands |
| Workflow | workflows, workflow_states, workflow_transitions, workflow_rules, approval_requests, approval_steps |
| Transverse | folders, documents, document_versions, comments, attachments, tags, taggables, favorites, activities, notifications, dashboards, dashboard_widgets, reports, report_schedules, custom_fields, custom_field_values |

Points de conception :
- **Chemin critique / Gantt** : calculé à la volée côté API (CPM sur `tasks` + `task_dependencies`), les baselines figent un snapshot JSON — pas de duplication de lignes.
- **Charge / capacité** : `allocations` (prévisionnel) vs `time_entries` (réel) vs `resource_profiles.capacity` — les trois axes du reporting de charge.
- **Santé projet** : dérivée (retard planning, dérive budget, risques critiques ouverts) et matérialisée dans `projects.health` par job, historisée dans `project_status_reports`.
- **Corbeille / archivage** : soft delete (`deleted_at`) + `archived_at` sur portfolios/programmes/projets ; purge planifiée configurable.
