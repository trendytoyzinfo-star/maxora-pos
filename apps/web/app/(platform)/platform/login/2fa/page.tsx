"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { TotpInput } from "@/components/platform/totp-input";
import { LoginCard } from "@/components/platform/login-card";

async function verify2fa(code: string, mfaToken: string) {
  const res = await fetch("/api/platform/auth/2fa/verify", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, mfaToken }),
  });
  const body = (await res.json()) as { ok?: boolean; message?: string };
  if (!res.ok) throw Object.assign(new Error(body.message ?? `HTTP ${res.status}`), { status: res.status });
  return body;
}

async function verifyRecovery(code: string, mfaToken: string) {
  const res = await fetch("/api/platform/auth/2fa/recovery", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, mfaToken }),
  });
  const body = (await res.json()) as { ok?: boolean; message?: string };
  if (!res.ok) throw Object.assign(new Error(body.message ?? `HTTP ${res.status}`), { status: res.status });
  return body;
}

export default function PlatformLogin2faPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem("plt_mfa_token");
    if (!token) {
      router.replace("/platform/login");
      return;
    }
    setMfaToken(token);
  }, [router]);

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaToken || code.length !== 6) return;
    setError(null);
    setLoading(true);
    try {
      await verify2fa(code, mfaToken);
      sessionStorage.removeItem("plt_mfa_token");
      router.push("/platform/dashboard");
    } catch (err) {
      setError((err as Error).message ?? "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecoverySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaToken || !recoveryCode.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await verifyRecovery(recoveryCode.trim(), mfaToken);
      sessionStorage.removeItem("plt_mfa_token");
      router.push("/platform/dashboard");
    } catch (err) {
      setError((err as Error).message ?? "Invalid recovery code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginCard title={showRecovery ? "Use recovery code" : "Two-factor authentication"}>
      {showRecovery ? (
        <form onSubmit={handleRecoverySubmit} className="flex flex-col gap-4">
          <p className="text-sm text-center" style={{ color: "var(--plt-muted)" }}>
            Enter one of your recovery codes.
          </p>
          <input
            type="text"
            autoFocus
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            placeholder="XXXX-XXXX-XXXX"
            className="w-full rounded-lg border px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-[var(--plt-gold)]"
            style={{ background: "var(--plt-bg)", borderColor: "var(--plt-border)", color: "var(--plt-text)" }}
          />
          {error && (
            <div className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)", color: "#f87171" }} role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
            </div>
          )}
          <button type="submit" disabled={loading || !recoveryCode.trim()} className="mt-1 w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-60" style={{ background: "var(--plt-gold)", color: "#0b1220" }}>
            {loading ? "Verifying…" : "Use recovery code"}
          </button>
          <button type="button" onClick={() => setShowRecovery(false)} className="text-xs text-center hover:opacity-80" style={{ color: "var(--plt-muted)" }}>
            ← Back to authenticator code
          </button>
        </form>
      ) : (
        <form onSubmit={handleTotpSubmit} className="flex flex-col gap-5">
          <p className="text-sm text-center" style={{ color: "var(--plt-muted)" }}>
            Enter the 6-digit code from your authenticator app.
          </p>
          <TotpInput value={code} onChange={setCode} disabled={loading} />
          {error && (
            <div className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)", color: "#f87171" }} role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
            </div>
          )}
          <button type="submit" disabled={loading || code.length !== 6} className="w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-60" style={{ background: "var(--plt-gold)", color: "#0b1220" }}>
            {loading ? "Verifying…" : "Verify"}
          </button>
          <button type="button" onClick={() => setShowRecovery(true)} className="text-xs text-center hover:opacity-80" style={{ color: "var(--plt-muted)" }}>
            Use a recovery code
          </button>
        </form>
      )}
    </LoginCard>
  );
}
