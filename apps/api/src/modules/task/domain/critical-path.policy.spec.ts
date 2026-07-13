import { computeCriticalPath, taskDurationDays } from "./critical-path.policy";

const day = (value: string) => new Date(value);
const task = (id: string, start: string, due: string) => ({
  id,
  startDate: day(start),
  dueDate: day(due),
});

describe("critical-path.policy", () => {
  it("calcule des durées inclusives (même jour = 1)", () => {
    expect(taskDurationDays(task("a", "2026-01-01", "2026-01-01"))).toBe(1);
    expect(taskDurationDays(task("a", "2026-01-01", "2026-01-05"))).toBe(5);
  });

  it("retourne vide sans tâches datées", () => {
    expect(computeCriticalPath([{ id: "a", startDate: null, dueDate: null }], [])).toEqual([]);
  });

  it("une chaîne simple est entièrement critique", () => {
    const tasks = [
      task("a", "2026-01-01", "2026-01-05"),
      task("b", "2026-01-06", "2026-01-10"),
    ];
    const edges = [{ predecessorId: "a", successorId: "b" }];
    expect(computeCriticalPath(tasks, edges).sort()).toEqual(["a", "b"]);
  });

  it("identifie la branche la plus longue d'un diamant", () => {
    // a → b(5j) → d ; a → c(2j) → d : le chemin par b est critique
    const tasks = [
      task("a", "2026-01-01", "2026-01-02"), // 2 j
      task("b", "2026-01-03", "2026-01-07"), // 5 j
      task("c", "2026-01-03", "2026-01-04"), // 2 j
      task("d", "2026-01-08", "2026-01-09"), // 2 j
    ];
    const edges = [
      { predecessorId: "a", successorId: "b" },
      { predecessorId: "a", successorId: "c" },
      { predecessorId: "b", successorId: "d" },
      { predecessorId: "c", successorId: "d" },
    ];
    const critical = computeCriticalPath(tasks, edges).sort();
    expect(critical).toEqual(["a", "b", "d"]);
    expect(critical).not.toContain("c");
  });

  it("une tâche isolée courte n'est pas critique face à une chaîne plus longue", () => {
    const tasks = [
      task("chaine1", "2026-01-01", "2026-01-10"), // 10 j
      task("isolee", "2026-01-01", "2026-01-02"), // 2 j
    ];
    expect(computeCriticalPath(tasks, [])).toEqual(["chaine1"]);
  });

  it("ignore les arêtes vers des tâches non datées", () => {
    const tasks = [
      task("a", "2026-01-01", "2026-01-05"),
      { id: "sans-dates", startDate: null, dueDate: null },
    ];
    const edges = [{ predecessorId: "a", successorId: "sans-dates" }];
    expect(computeCriticalPath(tasks, edges)).toEqual(["a"]);
  });
});
