/**
 * Invariants du graphe de tâches (fonctions pures) :
 * - les dépendances fin→début forment un DAG (aucun cycle) ;
 * - la hiérarchie parent/enfant est un arbre (pas d'auto-parenté).
 */

export interface DependencyEdge {
  predecessorId: string;
  successorId: string;
}

/**
 * Vrai si ajouter `candidate` créerait un cycle : il existe déjà un chemin
 * du successeur candidat vers le prédécesseur candidat.
 */
export function wouldCreateDependencyCycle(
  edges: readonly DependencyEdge[],
  candidate: DependencyEdge,
): boolean {
  if (candidate.predecessorId === candidate.successorId) {
    return true;
  }
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const next = adjacency.get(edge.predecessorId) ?? [];
    next.push(edge.successorId);
    adjacency.set(edge.predecessorId, next);
  }
  // Parcours depuis le successeur candidat : si on atteint le prédécesseur
  // candidat, la nouvelle arête refermerait une boucle.
  const stack = [candidate.successorId];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === candidate.predecessorId) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    stack.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

/** Ids de tous les descendants (sous-tâches récursives) d'une tâche. */
export function collectDescendantIds(
  tasks: ReadonlyArray<{ id: string; parentId: string | null }>,
  rootId: string,
): string[] {
  const children = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.parentId) {
      const list = children.get(task.parentId) ?? [];
      list.push(task.id);
      children.set(task.parentId, list);
    }
  }
  const result: string[] = [];
  const stack = [...(children.get(rootId) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop()!;
    result.push(current);
    stack.push(...(children.get(current) ?? []));
  }
  return result;
}
