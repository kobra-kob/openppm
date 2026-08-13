/**
 * Seed idempotent :
 *  - 10 rôles système globaux (organization_id = null) ;
 *  - le catalogue de permissions fines (action + subject) ;
 *  - la matrice rôle → permissions (droits par défaut, alignés sur la matrice
 *    des responsabilités du cahier des charges).
 * Réexécutable sans effet de bord (upsert par clé / (action,subject)).
 */
import { PrismaClient, RoleKey } from "../generated/client";

const prisma = new PrismaClient();

const SYSTEM_ROLES: Array<{ key: RoleKey; name: string }> = [
  { key: RoleKey.admin, name: "Administrateur" },
  { key: RoleKey.manager, name: "Manager" },
  { key: RoleKey.project_manager, name: "Chef de projet" },
  { key: RoleKey.pmo, name: "PMO" },
  { key: RoleKey.finance, name: "Responsable financier" },
  { key: RoleKey.employee, name: "Collaborateur" },
  { key: RoleKey.observer, name: "Observateur" },
  { key: RoleKey.guest, name: "Invité" },
  { key: RoleKey.business_analyst, name: "Analyste métier" },
  { key: RoleKey.executive, name: "Direction / Comité" },
];

/**
 * Catalogue des permissions fines. La clé canonique est dérivée
 * `${subject}_${action}` en MAJUSCULES (ex. { demand, create } → DEMAND_CREATE,
 * { business_case, validate } → BUSINESS_CASE_VALIDATE).
 */
const PERMISSIONS: Array<{ subject: string; action: string }> = [
  // Demandes
  { subject: "demand", action: "create" },
  { subject: "demand", action: "read" },
  { subject: "demand", action: "update" },
  { subject: "demand", action: "submit" },
  { subject: "demand", action: "approve" },
  { subject: "demand", action: "reject" },
  { subject: "demand", action: "qualify" },
  // Business Case
  { subject: "business_case", action: "read" },
  { subject: "business_case", action: "create" },
  { subject: "business_case", action: "update" },
  { subject: "business_case", action: "validate" },
  // Budget
  { subject: "budget", action: "read" },
  { subject: "budget", action: "create" },
  { subject: "budget", action: "update" },
  { subject: "budget", action: "approve" },
  // Projet
  { subject: "project", action: "read" },
  { subject: "project", action: "create" },
  { subject: "project", action: "update" },
  { subject: "project", action: "delete" },
  { subject: "project", action: "assign_manager" },
  { subject: "project", action: "create_via_workflow" },
  { subject: "project", action: "plan" },
  { subject: "project", action: "execute" },
  { subject: "project", action: "close" },
  // Portefeuille
  { subject: "portfolio", action: "read" },
  { subject: "portfolio", action: "update" },
  // Risques
  { subject: "risk", action: "read" },
  { subject: "risk", action: "create" },
  { subject: "risk", action: "update" },
  { subject: "risk", action: "approve" },
  // Administration
  { subject: "role", action: "manage" },
  { subject: "member", action: "manage" },
  { subject: "workflow", action: "manage" },
  { subject: "organization", action: "manage" },
];

const permKey = (subject: string, action: string): string =>
  `${subject}_${action}`.toUpperCase();

/** Raccourcis de listes de permissions par sujet. */
const READS = ["DEMAND_READ", "BUSINESS_CASE_READ", "BUDGET_READ", "PROJECT_READ", "PORTFOLIO_READ", "RISK_READ"];

/**
 * Matrice rôle → permissions (droits par défaut). Reflète la matrice des
 * responsabilités : ✓ accordé ici, △ (configurable) laissé à l'administration,
 * - non accordé. L'administrateur reçoit toutes les permissions.
 */
const ROLE_PERMISSIONS: Record<RoleKey, string[]> = {
  [RoleKey.admin]: PERMISSIONS.map((p) => permKey(p.subject, p.action)),
  [RoleKey.employee]: [
    "DEMAND_CREATE", "DEMAND_UPDATE", "DEMAND_SUBMIT", ...READS,
  ],
  [RoleKey.manager]: [
    "DEMAND_CREATE", "DEMAND_UPDATE", "DEMAND_SUBMIT", "DEMAND_APPROVE", "DEMAND_REJECT",
    ...READS,
  ],
  [RoleKey.pmo]: [
    "DEMAND_CREATE", "DEMAND_UPDATE", "DEMAND_SUBMIT", "DEMAND_APPROVE", "DEMAND_REJECT", "DEMAND_QUALIFY",
    "BUSINESS_CASE_CREATE", "BUSINESS_CASE_UPDATE", "BUSINESS_CASE_VALIDATE",
    "PROJECT_PLAN", "PROJECT_CLOSE",
    "PORTFOLIO_UPDATE",
    "RISK_CREATE", "RISK_UPDATE", "RISK_APPROVE",
    ...READS,
  ],
  [RoleKey.business_analyst]: [
    "DEMAND_CREATE", "DEMAND_UPDATE",
    "BUSINESS_CASE_CREATE", "BUSINESS_CASE_UPDATE",
    ...READS,
  ],
  [RoleKey.finance]: [
    "BUSINESS_CASE_UPDATE", "BUSINESS_CASE_VALIDATE",
    "BUDGET_CREATE", "BUDGET_UPDATE", "BUDGET_APPROVE",
    ...READS,
  ],
  [RoleKey.project_manager]: [
    "DEMAND_CREATE",
    "BUSINESS_CASE_UPDATE",
    "PROJECT_PLAN", "PROJECT_EXECUTE", "PROJECT_CLOSE",
    "RISK_CREATE", "RISK_UPDATE",
    ...READS,
  ],
  [RoleKey.executive]: [
    "DEMAND_APPROVE", "DEMAND_REJECT",
    "BUSINESS_CASE_VALIDATE",
    "BUDGET_APPROVE",
    "PROJECT_CREATE_VIA_WORKFLOW", "PROJECT_CLOSE",
    "PORTFOLIO_UPDATE",
    ...READS,
  ],
  [RoleKey.observer]: [...READS],
  [RoleKey.guest]: ["PROJECT_READ"],
};

async function seedRoles(): Promise<Map<RoleKey, string>> {
  const ids = new Map<RoleKey, string>();
  for (const role of SYSTEM_ROLES) {
    const row = await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name },
      create: { key: role.key, name: role.name, isSystem: true },
    });
    ids.set(role.key, row.id);
  }
  return ids;
}

async function seedPermissions(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const p of PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { action_subject: { action: p.action, subject: p.subject } },
      update: {},
      create: { action: p.action, subject: p.subject },
    });
    ids.set(permKey(p.subject, p.action), row.id);
  }
  return ids;
}

async function seedRolePermissions(
  roleIds: Map<RoleKey, string>,
  permIds: Map<string, string>,
): Promise<void> {
  for (const [roleKey, permKeys] of Object.entries(ROLE_PERMISSIONS) as Array<[RoleKey, string[]]>) {
    const roleId = roleIds.get(roleKey)!;
    for (const pk of permKeys) {
      const permissionId = permIds.get(pk);
      if (!permissionId) {
        throw new Error(`Permission inconnue dans la matrice : ${pk}`);
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      });
    }
  }
}

async function main(): Promise<void> {
  const roleIds = await seedRoles();
  const permIds = await seedPermissions();
  await seedRolePermissions(roleIds, permIds);
  console.log(
    `Seed OK — ${SYSTEM_ROLES.length} rôles, ${PERMISSIONS.length} permissions, matrice appliquée.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
