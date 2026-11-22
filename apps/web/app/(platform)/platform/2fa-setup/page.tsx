"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertCircle, CheckCircle } from "lucide-react";
import { TotpInput } from "@/components/platform/totp-input";
import { usePlatformSetup2fa, usePlatformConfirm2fa } from "@/hooks/use-platform-auth";

export default function Platform2faSetupPage() {
  const router = useRouter();
  const setup = usePlatformSetup2fa();
  const confirm = usePlatformConfirm2fa();
  const [step, setStep] = useState<"init" | "scan" | "confirm" | "done">("init");
  const [secret, setSecret] = useState("");
  const [url, setUrl] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setError(null);
    try {
      const res = await setup.mutateAsync();
      setSecret(res.secret);
      setUrl(res.url);
      setStep("scan");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await confirm.mutateAsync(code);
      setRecoveryCodes(res.recoveryCodes);
      setStep("done");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="platform-shell flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[460px]">
        <div className="mb-8 flex justify-center">
          <Image src="/brand-lockup-transparent.png" alt="Maxora POS" width={180} height={87} priority className="h-auto w-auto" />
        </div>

        <div className="rounded-[20px] border p-8" style={{ background: "var(--plt-surface)", borderColor: "var(--plt-border)", boxShadow: "0 8px 40px rgba(0,0,0,0.45)" }}>
          {step === "init" && (
            <div className="flex flex-col gap-5 text-center">
              <h1 className="text-xl font-semibold" style={{ color: "var(--plt-text)" }}>Set up two-factor authentication</h1>
              <p className="text-sm" style={{ color: "var(--plt-muted)" }}>
                Your role requires 2FA. Scan a QR code with your authenticator app to get started.
              </p>
              <button onClick={handleStart} disabled={setup.isPending} className="w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-60" style={{ background: "var(--plt-gold)", color: "#0b1220" }}>
                {setup.isPending ? "Generating…" : "Get started"}
              </button>
            </div>
          )}

          {step === "scan" && (
            <div className="flex flex-col gap-5">
              <h1 className="text-xl font-semibold text-center" style={{ color: "var(--plt-text)" }}>Scan QR code</h1>
              <p className="text-sm text-center" style={{ color: "var(--plt-muted)" }}>
                Open your authenticator app and scan this code, or enter the secret manually.
              </p>
              {/* QR code rendered as an otpauth link — in a real app use next/image with qrcode lib */}
              <div className="flex justify-center">
                <a
                  href={url}
                  className="block rounded-lg border p-4 text-xs font-mono break-all text-center"
                  style={{ borderColor: "var(--plt-border)", color: "var(--plt-muted)", maxWidth: 320 }}
                  title="Click to open in authenticator"
                >
                  <span className="block mb-2 font-semibold" style={{ color: "var(--plt-text)" }}>Manual entry key</span>
                  {secret}
                </a>
              </div>
              <button onClick={() => setStep("confirm")} className="w-full rounded-lg py-3 text-sm font-semibold" style={{ background: "var(--plt-gold)", color: "#0b1220" }}>
                I&apos;ve scanned the code →
              </button>
            </div>
          )}

          {step === "confirm" && (
            <form onSubmit={handleConfirm} className="flex flex-col gap-5">
              <h1 className="text-xl font-semibold text-center" style={{ color: "var(--plt-text)" }}>Confirm code</h1>
              <p className="text-sm text-center" style={{ color: "var(--plt-muted)" }}>
                Enter the 6-digit code from your authenticator app to complete setup.
              </p>
              <TotpInput value={code} onChange={setCode} disabled={confirm.isPending} />
              {error && (
                <div className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)", color: "#f87171" }} role="alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
                </div>
              )}
              <button type="submit" disabled={confirm.isPending || code.length !== 6} className="w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-60" style={{ background: "var(--plt-gold)", color: "#0b1220" }}>
                {confirm.isPending ? "Verifying…" : "Enable 2FA"}
              </button>
            </form>
          )}

          {step === "done" && (
            <div className="flex flex-col gap-5">
              <div className="flex justify-center"><CheckCircle className="h-12 w-12" style={{ color: "var(--plt-gold)" }} /></div>
              <h1 className="text-xl font-semibold text-center" style={{ color: "var(--plt-text)" }}>2FA enabled!</h1>
              <p className="text-sm text-center" style={{ color: "var(--plt-muted)" }}>
                Save these recovery codes in a safe place. Each can only be used once.
              </p>
              <div className="rounded-lg border p-4" style={{ borderColor: "var(--plt-border)", background: "var(--plt-bg)" }}>
                <ul className="grid grid-cols-2 gap-2">
                  {recoveryCodes.map((c) => (
                    <li key={c} className="font-mono text-sm text-center" style={{ color: "var(--plt-text)" }}>{c}</li>
                  ))}
                </ul>
              </div>
              <button onClick={() => router.push("/platform/dashboard")} className="w-full rounded-lg py-3 text-sm font-semibold" style={{ background: "var(--plt-gold)", color: "#0b1220" }}>
                Continue to dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
