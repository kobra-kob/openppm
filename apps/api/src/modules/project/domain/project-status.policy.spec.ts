import { ProjectStatus } from "@openppm/db";
import { allowedTransitions, canTransition } from "./project-status.policy";

describe("project-status.policy", () => {
  it("draft ne peut aller que vers active ou archived", () => {
    expect(allowedTransitions(ProjectStatus.draft)).toEqual([
      ProjectStatus.active,
      ProjectStatus.archived,
    ]);
    expect(canTransition(ProjectStatus.draft, ProjectStatus.completed)).toBe(false);
    expect(canTransition(ProjectStatus.draft, ProjectStatus.on_hold)).toBe(false);
  });

  it("active peut être suspendu, terminé ou archivé", () => {
    expect(canTransition(ProjectStatus.active, ProjectStatus.on_hold)).toBe(true);
    expect(canTransition(ProjectStatus.active, ProjectStatus.completed)).toBe(true);
    expect(canTransition(ProjectStatus.active, ProjectStatus.archived)).toBe(true);
    expect(canTransition(ProjectStatus.active, ProjectStatus.draft)).toBe(false);
  });

  it("on_hold et completed reviennent vers active", () => {
    expect(canTransition(ProjectStatus.on_hold, ProjectStatus.active)).toBe(true);
    expect(canTransition(ProjectStatus.completed, ProjectStatus.active)).toBe(true);
    expect(canTransition(ProjectStatus.on_hold, ProjectStatus.completed)).toBe(false);
  });

  it("archived ne peut que se désarchiver vers active", () => {
    expect(allowedTransitions(ProjectStatus.archived)).toEqual([ProjectStatus.active]);
    expect(canTransition(ProjectStatus.archived, ProjectStatus.completed)).toBe(false);
  });

  it("aucune transition vers soi-même", () => {
    for (const status of Object.values(ProjectStatus)) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});
