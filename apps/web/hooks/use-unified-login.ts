"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionUser, UnifiedLoginDto } from "@maxora/types";
import { ApiError } from "@/lib/api";
import { friendlyMessage, NETWORK_ERROR_MESSAGE, readJsonSafely } from "@/lib/safe-fetch";

export type UnifiedLoginOutcome =
  | { accountType: "restaurant"; user: SessionUser }
  | { accountType: "platform"; ok?: boolean; mfaRequired?: boolean; mfaToken?: string };

type ErrBody = { message?: string; code?: string; issues?: unknown };

/** POST JSON and either return the parsed body or throw an ApiError with a user-safe message. */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
  }
  const result = await readJsonSafely<T & ErrBody>(res);
  if (!result.ok || !result.data) {
    throw new ApiError(friendlyMessage(result), result.status || 500, result.data?.issues, result.data?.code);
  }
  return result.data;
}

/** One sign-in for restaurant staff and platform accounts; the server decides which one matched. */
export function useUnifiedLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UnifiedLoginDto) => postJson<UnifiedLoginOutcome>("/api/auth/unified-login", dto),
    onSuccess: (data) => {
      if (data.accountType === "restaurant") {
        // Same cache hygiene as the restaurant login: nothing cached before belongs to this user.
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
        queryClient.setQueryData(["auth", "me"], { user: data.user });
      } else if (!data.mfaRequired) {
        void queryClient.invalidateQueries({ queryKey: ["platform", "me"] });
      }
    },
  });
}

/** Second step for platform accounts when PLATFORM_REQUIRE_2FA is on: an authenticator code or a recovery code. */
export function useVerifyPlatformMfa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, mfaToken }: { code: string; mfaToken: string }) => {
      const trimmed = code.trim();
      const isTotp = /^\d{6}$/.test(trimmed);
      return postJson<{ ok: boolean }>(
        isTotp ? "/api/platform/auth/2fa/verify" : "/api/platform/auth/2fa/recovery",
        { code: trimmed, mfaToken },
      );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["platform", "me"] }),
  });
}
