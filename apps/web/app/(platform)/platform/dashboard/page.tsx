"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePlatformCurrentUser, usePlatformLogout } from "@/hooks/use-platform-auth";

export default function PlatformDashboardPage() {
  const router = useRouter();
  const { data: user, isLoading, isError, error } = usePlatformCurrentUser();
  const logout = usePlatformLogout();

  useEffect(() => {
    if (!isError) return;
    const err = error as (Error & { status?: number; code?: string }) | null;
    if (err?.code === "MFA_SETUP_REQUIRED" || err?.status === 403) {
      router.replace("/platform/2fa-setup");
      return;
    }
    router.replace("/platform/login");
  }, [isError, error, router]);

  useEffect(() => {
    if (user && !user.twoFactorEnabled && (user.role === "SUPER_ADMIN" || user.role === "PLATFORM_ADMIN")) {
      router.replace("/platform/2fa-setup");
    }
  }, [user, router]);

  if (isLoading) {
    return (
      <div className="platform-shell flex min-h-screen items-center justify-center">
        <p style={{ color: "var(--plt-muted)" }}>Loading…</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="platform-shell min-h-screen p-8">
      <header className="flex items-center justify-between border-b pb-4 mb-8" style={{ borderColor: "var(--plt-border)" }}>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--plt-text)" }}>
            Maxora Platform
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--plt-muted)" }}>
            Super Admin Dashboard
          </p>
        </div>
        <button
          onClick={() => logout.mutate(undefined, { onSuccess: () => router.replace("/platform/login") })}
          disabled={logout.isPending}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: "var(--plt-surface)", color: "var(--plt-muted)", border: "1px solid var(--plt-border)" }}
        >
          {logout.isPending ? "Signing out…" : "Sign out"}
        </button>
      </header>

      <div
        className="rounded-[20px] border p-8 max-w-lg"
        style={{ background: "var(--plt-surface)", borderColor: "var(--plt-border)" }}
      >
        <p className="text-sm mb-1" style={{ color: "var(--plt-muted)" }}>Signed in as</p>
        <p className="text-xl font-semibold" style={{ color: "var(--plt-text)" }}>
          Welcome, {user.name}
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--plt-muted)" }}>{user.email}</p>
        <span
          className="mt-3 inline-block rounded px-2 py-0.5 text-xs font-mono font-semibold"
          style={{ background: "rgba(212,175,55,0.15)", color: "var(--plt-gold)" }}
        >
          {user.role}
        </span>
      </div>
    </div>
  );
}
