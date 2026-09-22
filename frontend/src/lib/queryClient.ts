"use client";

import { QueryClient } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // MOCK: dữ liệu nằm trên tab này. Khi có API thì bỏ Infinity để refetch.
        staleTime: Infinity,
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserClient) browserClient = makeQueryClient();
  return browserClient;
}
