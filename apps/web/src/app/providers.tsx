"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // staleTime 0 + refetch au montage/focus : toute navigation ou retour
          // d'onglet recharge les données, pour que les modules liés restent à jour
          // après une modification sans rechargement manuel de la page.
          queries: { retry: 1, staleTime: 0, refetchOnWindowFocus: true, refetchOnMount: true },
        },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
