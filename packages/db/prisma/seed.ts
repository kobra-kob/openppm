/**
 * Seed idempotent : crée les 8 rôles système globaux (organization_id = null).
 * Réexécutable sans effet de bord (upsert par clé).
 */
import { PrismaClient, RoleKey } from "../generated/client";

const prisma = new PrismaClient();

const SYSTEM_ROLES: Array<{ key: RoleKey; name: string }> = [
  { key: RoleKey.admin, name: "Administrateur" },
  { key: RoleKey.manager, name: "Manager" },
  { key: RoleKey.project_manager, name: "Chef de projet" },
  { key: RoleKey.pmo, name: "PMO" },
  { key: RoleKey.finance, name: "Finance" },
  { key: RoleKey.employee, name: "Employé" },
  { key: RoleKey.observer, name: "Observateur" },
  { key: RoleKey.guest, name: "Invité" },
  { key: RoleKey.business_analyst, name: "Analyste métier" },
  { key: RoleKey.executive, name: "Direction" },
];

async function main(): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name },
      create: { key: role.key, name: role.name, isSystem: true },
    });
  }
  console.log(`Seed OK — ${SYSTEM_ROLES.length} rôles système.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
