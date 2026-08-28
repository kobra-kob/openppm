import type { PrismaService } from "../src/core/prisma/prisma.service";

/**
 * Purge complète de la base de test dans un ordre respectant les clés
 * étrangères (enfants → parents). Les rôles système (seed) sont conservés.
 *
 * Point unique de nettoyage partagé par toutes les suites d'intégration :
 * évite les échecs d'isolation inter-suites (une suite laissant des documents,
 * risques ou instances de workflow qui bloquent la suppression d'une autre).
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  // Demandes & Business Case
  await prisma.businessCaseRisk.deleteMany();
  await prisma.businessCase.deleteMany();
  await prisma.risk.deleteMany();
  await prisma.document.deleteMany();
  // Workflow générique
  await prisma.workflowTransitionLog.deleteMany();
  await prisma.workflowInstance.deleteMany();
  await prisma.workflowTransition.deleteMany();
  await prisma.workflowState.deleteMany();
  await prisma.workflowDefinition.deleteMany();
  // Gouvernance budgétaire & finances
  await prisma.approvalStep.deleteMany();
  await prisma.budgetRequest.deleteMany();
  await prisma.quoteLine.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.costEntry.deleteMany();
  await prisma.budgetLine.deleteMany();
  // Demandes
  await prisma.demandTag.deleteMany();
  await prisma.demand.deleteMany();
  // Collaboration & tâches
  await prisma.comment.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.checklistItem.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.task.deleteMany();
  await prisma.boardColumn.deleteMany();
  await prisma.board.deleteMany();
  await prisma.favorite.deleteMany();
  // Projets & portefeuilles
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.portfolio.deleteMany();
  await prisma.projectTemplate.deleteMany();
  await prisma.projectCategory.deleteMany();
  // Identité & accès
  await prisma.refreshToken.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.invitation.deleteMany();
  // Billing : abonnements/factures avant orgs (FK), events indépendants.
  await prisma.invoice.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.billingEvent.deleteMany();
  // Multi-tenant : memberships avant users/orgs (FK RESTRICT sur l'org)
  await prisma.membershipRole.deleteMany();
  await prisma.organizationMembership.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}
