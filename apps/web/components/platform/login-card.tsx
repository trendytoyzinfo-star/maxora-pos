"use client";

import Image from "next/image";
import React from "react";

interface LoginCardProps {
  /** Card title, e.g. "Sign in" */
  title: string;
  /** Logo src — defaults to transparent brand lockup */
  logoSrc?: string;
  children: React.ReactNode;
}

/**
 * Shared login card for platform (and optionally other) panels.
 * Dark-themed, centered, no sidebar.
 */
export function LoginCard({ title, logoSrc = "/brand-lockup-transparent.png", children }: LoginCardProps) {
  return (
    <div className="platform-shell flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Image
            src={logoSrc}
            alt="Maxora POS"
            width={220}
            height={107}
            priority
            className="h-auto w-full max-w-[220px] object-contain"
          />
        </div>

        {/* Card */}
        <div
          className="rounded-[20px] border p-8"
          style={{
            background: "var(--plt-surface)",
            borderColor: "var(--plt-border)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.45)",
          }}
        >
          <h1
            className="mb-6 text-center text-xl font-semibold tracking-tight"
            style={{ color: "var(--plt-text)" }}
          >
            {title}
          </h1>
          {children}
        </div>
      </div>
    </div>
  );
}
