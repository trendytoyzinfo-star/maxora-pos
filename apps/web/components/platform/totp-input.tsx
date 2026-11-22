"use client";

import React, { useRef, useEffect, ClipboardEvent, KeyboardEvent, ChangeEvent } from "react";

interface TotpInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * 6-box TOTP input with auto-focus, arrow-key navigation, backspace support,
 * and paste support.
 */
export function TotpInput({ value, onChange, disabled }: TotpInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, "").slice(0, 6).split("");

  function focus(idx: number) {
    inputs.current[idx]?.focus();
  }

  useEffect(() => {
    focus(0);
  }, []);

  function handleChange(idx: number, e: ChangeEvent<HTMLInputElement>) {
    const ch = e.target.value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[idx] = ch;
    onChange(next.join(""));
    if (ch && idx < 5) focus(idx + 1);
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[idx]) {
        const next = [...digits];
        next[idx] = "";
        onChange(next.join(""));
      } else if (idx > 0) {
        focus(idx - 1);
      }
    } else if (e.key === "ArrowLeft" && idx > 0) {
      focus(idx - 1);
    } else if (e.key === "ArrowRight" && idx < 5) {
      focus(idx + 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(pasted.padEnd(6, ""));
    focus(Math.min(pasted.length, 5));
  }

  return (
    <div className="flex gap-2 justify-center" role="group" aria-label="One-time code">
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => void (inputs.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digits[i] ?? ""}
          disabled={disabled}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="h-12 w-10 rounded-lg border text-center text-lg font-mono focus:outline-none focus:ring-2 transition-colors"
          style={{
            background: "var(--plt-bg)",
            borderColor: "var(--plt-border)",
            color: "var(--plt-text)",
          }}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
