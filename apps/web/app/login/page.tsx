"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useUnifiedLogin, useVerifyPlatformMfa } from "@/hooks/use-unified-login";
import { useDemoInfo } from "@/hooks/use-demo";
import { ApiError } from "@/lib/api";
import { SERVER_ERROR_MESSAGE } from "@/lib/safe-fetch";

type Locale = "en" | "hi";
type Mode = "password" | "pin";

// Local copy only for this page: the app-wide i18n covers en/es/fr, this page offers English / हिन्दी.
const T: Record<Locale, Record<string, string>> = {
  en: {
    subtitle: "Sign in to continue",
    identifier: "Email or phone number",
    identifierPh: "you@example.com or phone number",
    password: "Password",
    passwordPh: "Your password",
    pin: "PIN",
    pinPh: "Your PIN",
    code: "Verification code",
    codePh: "6-digit code or recovery code",
    codeHelp: "Open your authenticator app, or use one of your recovery codes.",
    signIn: "Sign in",
    signingIn: "Signing in…",
    verify: "Verify",
    verifying: "Verifying…",
    demo: "Try the live demo (no password)",
    newRestaurant: "New restaurant?",
    create: "Create an account",
    required: "Please fill in all fields.",
  },
  hi: {
    subtitle: "जारी रखने के लिए साइन इन करें",
    identifier: "ईमेल या फ़ोन नंबर",
    identifierPh: "you@example.com या फ़ोन नंबर",
    password: "पासवर्ड",
    passwordPh: "आपका पासवर्ड",
    pin: "पिन",
    pinPh: "आपका पिन",
    code: "सत्यापन कोड",
    codePh: "6 अंकों का कोड या रिकवरी कोड",
    codeHelp: "अपना ऑथेंटिकेटर ऐप खोलें, या रिकवरी कोड में से एक का उपयोग करें।",
    signIn: "साइन इन करें",
    signingIn: "साइन इन हो रहा है…",
    verify: "सत्यापित करें",
    verifying: "सत्यापित हो रहा है…",
    demo: "लाइव डेमो आज़माएँ (बिना पासवर्ड)",
    newRestaurant: "नया रेस्तरां?",
    create: "खाता बनाएँ",
    required: "कृपया सभी फ़ील्ड भरें।",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const login = useUnifiedLogin();
  const verifyMfa = useVerifyPlatformMfa();
  const { data: demo } = useDemoInfo();
  const prefersReducedMotion = useReducedMotion();

  const [locale, setLocale] = useState<Locale>("en");
  const [mode, setMode] = useState<Mode>("password");
  const [identifier, setIdentifier] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  // Restaurant two-factor: the server asked for a code after a correct password.
  const [needsCode, setNeedsCode] = useState(false);
  // Platform two-factor (PLATFORM_REQUIRE_2FA): a short-lived token for the code step, kept in memory only.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  // Inline under the form (a toast vanishes before it can be read).
  const [error, setError] = useState<string | null>(null);

  const t = T[locale];
  const pending = login.isPending || verifyMfa.isPending;
  const showCode = needsCode || mfaToken !== null;

  const fail = (err: unknown) => {
    setError(err instanceof ApiError ? err.message : SERVER_ERROR_MESSAGE);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Platform 2FA step: only the code is sent, together with the token from step one.
    if (mfaToken) {
      if (!code.trim()) return setError(t.required);
      verifyMfa.mutate(
        { code, mfaToken },
        { onSuccess: () => router.push("/platform/dashboard"), onError: fail },
      );
      return;
    }

    if (!identifier.trim() || !secret) return setError(t.required);
    login.mutate(
      {
        identifier: identifier.trim(),
        secret,
        mode,
        ...(needsCode && code.trim() ? { totp: code.trim() } : {}),
      },
      {
        onSuccess: (data) => {
          if (data.accountType === "platform") {
            if (data.mfaRequired && data.mfaToken) {
              setMfaToken(data.mfaToken);
              setCode("");
              return;
            }
            router.push("/platform/dashboard");
            return;
          }
          // A delivery rider has no back-office screens: open their deliveries.
          const rider =
            data.user.roleName === "DELIVERY_STAFF" && data.user.permissions.includes("delivery.rider");
          router.push(rider ? "/my-deliveries" : "/dashboard");
        },
        onError: (err) => {
          if (err instanceof ApiError && err.message === "TWO_FACTOR_REQUIRED") {
            setNeedsCode(true);
            return;
          }
          fail(err);
        },
      },
    );
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setSecret("");
    setError(null);
  };

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-background px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(50%_50%_at_50%_0%,color-mix(in_oklch,var(--primary),transparent_90%),transparent)]"
      />
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Link
            href="/"
            className="flex w-full max-w-[320px] items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Image
              src="/brand-lockup-transparent.png"
              alt="Maxora POS"
              width={320}
              height={156}
              priority
              className="h-auto w-full max-w-[320px] object-contain"
            />
          </Link>
          <h1 className="sr-only">Maxora POS</h1>
          <div className="flex w-full items-center justify-between">
            <p className="text-sm text-muted-foreground">{t.subtitle}</p>
            <button
              type="button"
              onClick={() => setLocale(locale === "en" ? "hi" : "en")}
              className="rounded px-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={locale === "en" ? "हिन्दी में बदलें" : "Switch to English"}
            >
              {locale === "en" ? "हिन्दी" : "English"}
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          {!mfaToken && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="identifier">{t.identifier}</Label>
                <Input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  autoFocus
                  className="h-11"
                  placeholder={t.identifierPh}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="secret">{mode === "pin" ? t.pin : t.password}</Label>
                  <div
                    role="group"
                    aria-label="Sign-in method"
                    className="inline-flex rounded-md border border-border p-0.5 text-xs"
                  >
                    {(["password", "pin"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={mode === m}
                        onClick={() => switchMode(m)}
                        className={`rounded px-2 py-1 font-medium transition-colors ${
                          mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {m === "pin" ? t.pin : t.password}
                      </button>
                    ))}
                  </div>
                </div>
                {mode === "pin" ? (
                  <Input
                    id="secret"
                    type="password"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    enterKeyHint="go"
                    className="h-11"
                    placeholder={t.pinPh}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value.replace(/\D/g, ""))}
                  />
                ) : (
                  <PasswordInput
                    id="secret"
                    autoComplete="current-password"
                    enterKeyHint="go"
                    className="h-11"
                    placeholder={t.passwordPh}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                  />
                )}
              </div>
            </>
          )}

          {showCode && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="totp">{t.code}</Label>
              <Input
                id="totp"
                inputMode="text"
                autoComplete="one-time-code"
                autoFocus
                className="h-11"
                placeholder={t.codePh}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t.codeHelp}</p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" className="mt-2 h-12 text-base" disabled={pending}>
            {mfaToken
              ? pending
                ? t.verifying
                : t.verify
              : pending
                ? t.signingIn
                : t.signIn}
          </Button>
          {demo?.demo && (
            <Link
              href="/demo"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-border text-base font-medium hover:bg-muted"
            >
              {t.demo}
            </Link>
          )}
        </form>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          {t.newRestaurant}{" "}
          <Link href="/signup" className="font-medium text-foreground hover:underline">
            {t.create}
          </Link>
        </p>
      </motion.div>
    </main>
  );
}
