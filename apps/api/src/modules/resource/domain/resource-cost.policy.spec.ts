import { RateUnit } from "@openppm/db";
import { calculateResourceCost, detectOverlaps } from "./resource-cost.policy";

describe("resource-cost.policy", () => {
  it("tarif journalier : jours × montant", () => {
    expect(calculateResourceCost(5, 650, RateUnit.DAY, 8)).toBe(3250);
  });

  it("tarif horaire : jours × heures/jour × montant", () => {
    expect(calculateResourceCost(5, 85, RateUnit.HOUR, 8)).toBe(3400);
    expect(calculateResourceCost(3, 85, RateUnit.HOUR, 8)).toBe(2040);
  });

  it("respecte heures/jour non standard", () => {
    expect(calculateResourceCost(2, 100, RateUnit.HOUR, 7)).toBe(1400);
  });

  it("détecte les chevauchements de tâches", () => {
    const d = (s: string) => new Date(s);
    const conflicts = detectOverlaps([
      { taskId: "a", startDate: d("2026-10-01"), dueDate: d("2026-10-05") },
      { taskId: "b", startDate: d("2026-10-03"), dueDate: d("2026-10-07") },
      { taskId: "c", startDate: d("2026-10-12"), dueDate: d("2026-10-14") },
    ]);
    expect(conflicts).toEqual([["a", "b"]]);
  });

  it("ignore les tâches sans dates", () => {
    expect(
      detectOverlaps([
        { taskId: "a", startDate: null, dueDate: null },
        { taskId: "b", startDate: new Date("2026-10-03"), dueDate: new Date("2026-10-07") },
      ]),
    ).toEqual([]);
  });
});
