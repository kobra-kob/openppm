import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/** true une fois hydraté côté client, false pendant le rendu serveur. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
