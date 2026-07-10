import {
  collectDescendantIds,
  wouldCreateDependencyCycle,
} from "./task-graph.policy";

describe("task-graph.policy", () => {
  describe("wouldCreateDependencyCycle", () => {
    it("refuse l'auto-dépendance", () => {
      expect(
        wouldCreateDependencyCycle([], { predecessorId: "a", successorId: "a" }),
      ).toBe(true);
    });

    it("accepte une arête dans un graphe vide et une chaîne simple", () => {
      expect(
        wouldCreateDependencyCycle([], { predecessorId: "a", successorId: "b" }),
      ).toBe(false);
      expect(
        wouldCreateDependencyCycle(
          [{ predecessorId: "a", successorId: "b" }],
          { predecessorId: "b", successorId: "c" },
        ),
      ).toBe(false);
    });

    it("détecte un cycle direct (b→a alors que a→b)", () => {
      expect(
        wouldCreateDependencyCycle(
          [{ predecessorId: "a", successorId: "b" }],
          { predecessorId: "b", successorId: "a" },
        ),
      ).toBe(true);
    });

    it("détecte un cycle transitif (c→a alors que a→b→c)", () => {
      const edges = [
        { predecessorId: "a", successorId: "b" },
        { predecessorId: "b", successorId: "c" },
      ];
      expect(
        wouldCreateDependencyCycle(edges, { predecessorId: "c", successorId: "a" }),
      ).toBe(true);
    });

    it("accepte les diamants (a→b, a→c, b→d, c→d)", () => {
      const edges = [
        { predecessorId: "a", successorId: "b" },
        { predecessorId: "a", successorId: "c" },
        { predecessorId: "b", successorId: "d" },
      ];
      expect(
        wouldCreateDependencyCycle(edges, { predecessorId: "c", successorId: "d" }),
      ).toBe(false);
    });
  });

  describe("collectDescendantIds", () => {
    const tasks = [
      { id: "root", parentId: null },
      { id: "a", parentId: "root" },
      { id: "b", parentId: "root" },
      { id: "a1", parentId: "a" },
      { id: "a1x", parentId: "a1" },
      { id: "autre", parentId: null },
    ];

    it("collecte récursivement toutes les sous-tâches", () => {
      expect(collectDescendantIds(tasks, "root").sort()).toEqual([
        "a",
        "a1",
        "a1x",
        "b",
      ]);
    });

    it("retourne vide pour une feuille", () => {
      expect(collectDescendantIds(tasks, "a1x")).toEqual([]);
    });
  });
});
