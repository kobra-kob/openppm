import { ProjectStatus } from "@openppm/db";

/**
 * Workflow de cycle de vie Phase 1 (figé — le moteur de workflow
 * configurable arrive en v1.0) :
 * draft → active ⇄ on_hold, active → completed (réouvrable),
 * tout état → archived, archived → active (désarchivage).
 */
const TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  [ProjectStatus.draft]: [ProjectStatus.active, ProjectStatus.archived],
  [ProjectStatus.active]: [
    ProjectStatus.on_hold,
    ProjectStatus.completed,
    ProjectStatus.archived,
  ],
  [ProjectStatus.on_hold]: [ProjectStatus.active, ProjectStatus.archived],
  [ProjectStatus.completed]: [ProjectStatus.active, ProjectStatus.archived],
  [ProjectStatus.archived]: [ProjectStatus.active],
};

export function allowedTransitions(from: ProjectStatus): readonly ProjectStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
