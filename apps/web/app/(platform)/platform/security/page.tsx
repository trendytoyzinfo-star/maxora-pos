"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, LogOut } from "lucide-react";
import {
  usePlatformCurrentUser,
  usePlatformSessions,
  usePlatformRevokeSession,
  usePlatformLogoutAll,
} from "@/hooks/use-platform-auth";

export default function PlatformSecurityPage() {
  const router = useRouter();
  const { data: user, isLoading, isError, error } = usePlatformCurrentUser();
  const { data: sessions } = usePlatformSessions();
  const revokeSession = usePlatformRevokeSession();
  const logoutAll = usePlatformLogoutAll();

  useEffect(() => {
    if (!isError) return;
    const err = error as (Error & { status?: number; code?: string }) | null;
    if (err?.code === "MFA_SETUP_REQUIRED" || err?.status === 403) {
      router.replace("/platform/2fa-setup");
      return;
    }
    router.replace("/platform/login");
  }, [isError, error, router]);

  if (isLoading) {
    return (
      <div className="platform-shell flex min-h-screen items-center justify-center">
        <p style={{ color: "var(--plt-muted)" }}>Loading…</p>
      </div>
    );
  }

  if (!user) return null;

  const require2fa = user.require2fa === true;

  return (
    <div className="platform-shell min-h-screen p-8">
      <header
        className="flex items-center justify-between border-b pb-4 mb-8"
        style={{ borderColor: "var(--plt-border)" }}
      >
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--plt-text)" }}>
            Security
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--plt-muted)" }}>
            Two-factor authentication and active sessions
          </p>
        </div>
        <Link
          href="/platform/dashboard"
          className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            background: "var(--plt-surface)",
            color: "var(--plt-text)",
            border: "1px solid var(--plt-border)",
          }}
        >
          ← Dashboard
        </Link>
      </header>

      <div className="max-w-2xl flex flex-col gap-6">
        {/* Two-Factor Authentication */}
        <section
          className="rounded-[20px] border p-6"
          style={{ background: "var(--plt-surface)", borderColor: "var(--plt-border)" }}
        >
          <div className="flex items-center gap-3 mb-3">
            <Shield className="h-5 w-5" style={{ color: "var(--plt-gold)" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--plt-text)" }}>
              Two-factor authentication (2FA)
            </h2>
          </div>

          {!require2fa ? (
            <p className="text-sm" style={{ color: "var(--plt-muted)" }}>
              2FA is currently disabled by server setting
            </p>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm" style={{ color: "var(--plt-muted)" }}>
                {user.twoFactorEnabled
                  ? "2FA is enabled on your account."
                  : "2FA is required for your role but not yet configured."}
              </p>
              {!user.twoFactorEnabled && (
                <Link
                  href="/platform/2fa-setup"
                  className="rounded-lg px-4 py-2 text-sm font-semibold shrink-0"
                  style={{ background: "var(--plt-gold)", color: "#0b1220" }}
                >
                  Set up 2FA
                </Link>
              )}
            </div>
          )}
        </section>

        {/* Active Sessions */}
        <section
          className="rounded-[20px] border p-6"
          style={{ background: "var(--plt-surface)", borderColor: "var(--plt-border)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={{ color: "var(--plt-text)" }}>
              Active sessions
            </h2>
            <button
              onClick={() =>
                logoutAll.mutate(undefined, {
                  onSuccess: () => router.replace("/platform/login"),
                })
              }
              disabled={logoutAll.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{
                background: "var(--plt-bg)",
                color: "var(--plt-muted)",
                border: "1px solid var(--plt-border)",
              }}
            >
              <LogOut className="h-3.5 w-3.5" />
              {logoutAll.isPending ? "Signing out…" : "Sign out all"}
            </button>
          </div>

          {!sessions || sessions.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--plt-muted)" }}>
              No active sessions found.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3"
                  style={{ background: "var(--plt-bg)", borderColor: "var(--plt-border)" }}
                >
                  <div className="min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--plt-text)" }}
                    >
                      {s.device ?? "Unknown device"}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--plt-muted)" }}>
                      IP: {s.ip ?? "unknown"} · Last seen:{" "}
                      {new Date(s.lastSeenAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => revokeSession.mutate(s.id)}
                    disabled={revokeSession.isPending}
                    className="rounded-md px-3 py-1.5 text-xs font-medium shrink-0 transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{
                      background: "rgba(239,68,68,0.12)",
                      color: "#f87171",
                      border: "1px solid rgba(239,68,68,0.3)",
                    }}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
