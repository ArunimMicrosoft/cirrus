"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type LoginRequest } from "@/lib/api-client";

export function useAuthState() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.auth.me(),
    staleTime: 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LoginRequest) => api.auth.login(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auth"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      qc.clear();
    },
  });
}
