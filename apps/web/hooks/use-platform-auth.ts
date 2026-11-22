"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlatformLoginDto, PlatformTotpDto, PlatformRecoveryDto } from "@maxora/types";
import { friendlyMessage, NETWORK_ERROR_MESSAGE, readJsonSafely } from "@/lib/safe-fetch";

// All platform API calls go through the Next.js /api proxy → backend /api/platform/...
const BASE = "/api/platform";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
  } catch {
    throw Object.assign(new Error(NETWORK_ERROR_MESSAGE), { status: 0 });
  }
  const result = await readJsonSafely<T & { message?: string; code?: string }>(res);
  if (!result.ok) {
    const err = new Error(friendlyMessage(result)) as Error & { status: number; code?: string };
    err.status = result.status;
    err.code = result.data?.code;
    throw err;
  }
  return (result.data ?? ({} as T)) as T;
}

// ---------------------------------------------------------------------------
// Current user
// ---------------------------------------------------------------------------

export function usePlatformCurrentUser() {
  return useQuery({
    queryKey: ["platform", "me"],
    queryFn: () =>
      apiFetch<{
        id: string;
        name: string;
        email: string;
        role: string;
        twoFactorEnabled: boolean;
        require2fa?: boolean;
        lastLoginAt: string | null;
      }>("/me"),
    retry: false,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export function usePlatformLogin() {
  return useMutation({
    mutationFn: (dto: PlatformLoginDto) =>
      apiFetch<{ ok?: boolean; mfaRequired?: boolean; mfaToken?: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(dto),
      }),
  });
}

// ---------------------------------------------------------------------------
// 2FA verify
// ---------------------------------------------------------------------------

export function usePlatformVerifyTotp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: PlatformTotpDto) =>
      apiFetch<{ ok: boolean }>("/auth/2fa/verify", {
        method: "POST",
        body: JSON.stringify(dto),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "me"] }),
  });
}

// ---------------------------------------------------------------------------
// Recovery code
// ---------------------------------------------------------------------------

export function usePlatformVerifyRecovery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: PlatformRecoveryDto) =>
      apiFetch<{ ok: boolean }>("/auth/2fa/recovery", {
        method: "POST",
        body: JSON.stringify(dto),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "me"] }),
  });
}

// ---------------------------------------------------------------------------
// 2FA setup (authenticated)
// ---------------------------------------------------------------------------

export function usePlatformSetup2fa() {
  return useMutation({
    mutationFn: () => apiFetch<{ secret: string; url: string }>("/auth/2fa/setup", { method: "POST" }),
  });
}

export function usePlatformConfirm2fa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch<{ recoveryCodes: string[] }>("/auth/2fa/confirm", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "me"] }),
  });
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export function usePlatformLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),
    onSuccess: () => void qc.clear(),
  });
}

export function usePlatformLogoutAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>("/auth/logout-all", { method: "POST" }),
    onSuccess: () => void qc.clear(),
  });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function usePlatformSessions() {
  return useQuery({
    queryKey: ["platform", "sessions"],
    queryFn: () =>
      apiFetch<
        Array<{
          id: string;
          device: string | null;
          ip: string | null;
          createdAt: string;
          lastSeenAt: string;
        }>
      >("/security/sessions"),
  });
}

export function usePlatformRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiFetch<void>(`/security/sessions/${sessionId}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "sessions"] }),
  });
}
