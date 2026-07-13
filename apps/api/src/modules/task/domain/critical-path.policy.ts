/**
 * Méthode du chemin critique (CPM) sur le graphe de dépendances fin → début.
 * Seules les tâches datées participent ; le graphe est un DAG (garanti par
 * l'anti-cycle à l'écriture). Marge (slack) nulle = tâche critique.
 */
import type { DependencyEdge } from "./task-graph.policy";

export interface CpmTask {
  id: string;
  startDate: Date | null;
  dueDate: Date | null;
}

const DAY_MS = 86_400_000;

/** Durée en jours (bornes incluses), minimum 1. */
export function taskDurationDays(task: CpmTask): number {
  if (!task.startDate || !task.dueDate) {
    return 1;
  }
  return Math.max(
    1,
    Math.round((task.dueDate.getTime() - task.startDate.getTime()) / DAY_MS) + 1,
  );
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}

/**
 * Ids des tâches critiques (marge nulle sur le plus long chemin).
 * Les tâches sans dates et les arêtes qui les touchent sont ignorées.
 */
export function computeCriticalPath(
  tasks: readonly CpmTask[],
  edges: readonly DependencyEdge[],
): string[] {
  const dated = tasks.filter((task) => task.startDate && task.dueDate);
  if (dated.length === 0) {
    return [];
  }
  const duration = new Map(dated.map((task) => [task.id, taskDurationDays(task)]));
  const ids = new Set(duration.keys());
  const usable = edges.filter(
    (edge) => ids.has(edge.predecessorId) && ids.has(edge.successorId),
  );

  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const edge of usable) {
    push(predecessors, edge.successorId, edge.predecessorId);
    push(successors, edge.predecessorId, edge.successorId);
  }

  // Tri topologique (Kahn)
  const inDegree = new Map<string, number>();
  for (const id of ids) {
    inDegree.set(id, predecessors.get(id)?.length ?? 0);
  }
  const queue = [...ids].filter((id) => inDegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const next of successors.get(current) ?? []) {
      const degree = inDegree.get(next)! - 1;
      inDegree.set(next, degree);
      if (degree === 0) {
        queue.push(next);
      }
    }
  }

  // Passe avant : fin au plus tôt
  const earliestFinish = new Map<string, number>();
  for (const id of order) {
    const earliestStart = Math.max(
      0,
      ...(predecessors.get(id) ?? []).map((pred) => earliestFinish.get(pred) ?? 0),
    );
    earliestFinish.set(id, earliestStart + duration.get(id)!);
  }
  const projectEnd = Math.max(...earliestFinish.values());

  // Passe arrière : début au plus tard ; marge nulle → critique
  const latestStart = new Map<string, number>();
  const critical: string[] = [];
  for (const id of [...order].reverse()) {
    const latestFinish = Math.min(
      projectEnd,
      ...(successors.get(id) ?? []).map((succ) => latestStart.get(succ) ?? projectEnd),
    );
    const start = latestFinish - duration.get(id)!;
    latestStart.set(id, start);
    const earliestStart = earliestFinish.get(id)! - duration.get(id)!;
    if (start === earliestStart) {
      critical.push(id);
    }
  }
  return critical.reverse();
}
