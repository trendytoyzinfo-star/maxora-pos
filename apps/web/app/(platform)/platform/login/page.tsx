"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { AlertCircle } from "lucide-react";
import { platformLoginSchema, type PlatformLoginDto } from "@maxora/types";
import { LoginCard } from "@/components/platform/login-card";
import { LanguageToggle } from "@/components/platform/language-toggle";

// Inline platform-scoped input + button (avoids pulling in restaurant shadcn theme vars)
function PltInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors " +
        "focus:ring-2 focus:ring-[var(--plt-gold)] " +
        (props.className ?? "")
      }
      style={{
        background: "var(--plt-bg)",
        borderColor: "var(--plt-border)",
        color: "var(--plt-text)",
      }}
    />
  );
}

function PltButton({
  children,
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className="mt-2 w-full rounded-lg px-4 py-3 text-sm font-semibold transition-opacity disabled:opacity-60"
      style={{ background: "var(--plt-gold)", color: "#0b1220" }}
    >
      {loading ? "Signing in…" : children}
    </button>
  );
}

// Inline usePlatformLogin to keep dep simple (avoids query client on this page)
async function platformLogin(dto: PlatformLoginDto) {
  const res = await fetch("/api/platform/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dto),
  });
  const body = (await res.json()) as { ok?: boolean; mfaRequired?: boolean; mfaToken?: string; message?: string };
  if (!res.ok) throw Object.assign(new Error(body.message ?? `HTTP ${res.status}`), { status: res.status });
  return body;
}

export default function PlatformLoginPage() {
  const router = useRouter();
  const [locale, setLocale] = useState("en");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<PlatformLoginDto>({
    resolver: zodResolver(platformLoginSchema),
  });

  const L = {
    en: {
      title: "Sign in",
      email: "Email",
      password: "Password",
      forgot: "Forgot password?",
    },
    hi: {
      title: "साइन इन करें",
      email: "ईमेल",
      password: "पासवर्ड",
      forgot: "पासवर्ड भूल गए?",
    },
  }[locale] ?? { title: "Sign in", email: "Email", password: "Password", forgot: "Forgot password?" };

  async function onSubmit(dto: PlatformLoginDto) {
    setError(null);
    setLoading(true);
    try {
      const res = await platformLogin(dto);
      if (res.mfaRequired && res.mfaToken) {
        // Store mfaToken in sessionStorage and redirect
        sessionStorage.setItem("plt_mfa_token", res.mfaToken);
        router.push("/platform/login/2fa");
      } else {
        router.push("/platform/dashboard");
      }
    } catch (err) {
      setError((err as Error).message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginCard title="">
      {/* Title row with language toggle */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--plt-text)" }}>
          {L.title}
        </h1>
        <LanguageToggle locale={locale} onChange={setLocale} />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--plt-muted)" }}>
            {L.email}
          </label>
          <PltInput
            id="plt-email"
            type="email"
            autoComplete="username"
            autoFocus
            autoCapitalize="none"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs" style={{ color: "#f87171" }}>{errors.email.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium" style={{ color: "var(--plt-muted)" }}>
              {L.password}
            </label>
            <button
              type="button"
              className="text-xs hover:opacity-80"
              style={{ color: "var(--plt-gold)" }}
              onClick={() => setShowPass((v) => !v)}
            >
              {showPass ? "Hide" : "Show"}
            </button>
          </div>
          <PltInput
            id="plt-password"
            type={showPass ? "text" : "password"}
            autoComplete="current-password"
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs" style={{ color: "#f87171" }}>{errors.password.message}</p>
          )}
        </div>

        {error && (
          <div
            className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
            style={{ background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)", color: "#f87171" }}
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <PltButton type="submit" loading={loading}>
          {L.title}
        </PltButton>

        <p className="text-center text-xs" style={{ color: "var(--plt-muted)" }}>
          <a href="#" className="hover:opacity-80" style={{ color: "var(--plt-muted)" }}>
            {L.forgot}
          </a>
        </p>
      </form>
    </LoginCard>
  );
}
