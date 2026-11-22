"use client";

import React from "react";

const LABELS: Record<string, string> = {
  en: "English",
  hi: "हिन्दी",
};

interface LanguageToggleProps {
  locale: string;
  onChange: (locale: string) => void;
}

/**
 * Simple EN / हिन्दी language toggle for the platform login page.
 * Independent of the main app i18n (which supports en/es/fr).
 */
export function LanguageToggle({ locale, onChange }: LanguageToggleProps) {
  const next = locale === "en" ? "hi" : "en";
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      className="text-xs font-medium transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 rounded px-1"
      style={{ color: "var(--plt-muted)" }}
      aria-label={`Switch to ${LABELS[next]}`}
    >
      {locale === "en" ? "हिन्दी" : "English"}
    </button>
  );
}
