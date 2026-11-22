import { z } from "zod";
import { sessionUserSchema } from "./auth";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const PLATFORM_ROLES = [
  "SUPER_ADMIN",
  "PLATFORM_ADMIN",
  "SUPPORT_AGENT",
  "BILLING_MANAGER",
  "ANALYST",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

// ---------------------------------------------------------------------------
// Auth DTOs
// ---------------------------------------------------------------------------

export const platformLoginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password is required").max(200),
});
export type PlatformLoginDto = z.infer<typeof platformLoginSchema>;

export const platformTotpSchema = z.object({
  code: z.string().trim().min(6).max(20),
  mfaToken: z.string().min(1),
});
export type PlatformTotpDto = z.infer<typeof platformTotpSchema>;

export const platformRecoverySchema = z.object({
  code: z.string().trim().min(1),
  mfaToken: z.string().min(1),
});
export type PlatformRecoveryDto = z.infer<typeof platformRecoverySchema>;

export const platformTotpSetupConfirmSchema = z.object({
  code: z.string().trim().length(6, "Must be 6 digits"),
});
export type PlatformTotpSetupConfirmDto = z.infer<typeof platformTotpSetupConfirmSchema>;

// ---------------------------------------------------------------------------
// Session user (returned from /platform/me)
// ---------------------------------------------------------------------------

export const platformSessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(PLATFORM_ROLES),
  twoFactorEnabled: z.boolean(),
  require2fa: z.boolean().optional(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type PlatformSessionUser = z.infer<typeof platformSessionUserSchema>;

// ---------------------------------------------------------------------------
// Session list (returned from /platform/security/sessions)
// ---------------------------------------------------------------------------

export const platformSessionSchema = z.object({
  id: z.string(),
  device: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
});
export type PlatformSessionInfo = z.infer<typeof platformSessionSchema>;

// ---------------------------------------------------------------------------
// Unified login (POST /api/auth/unified-login) — one entry for restaurant staff
// and platform (Super Admin) accounts. The server decides which account type
// matched; the client never sends or sees it until after success.
// ---------------------------------------------------------------------------

export const unifiedLoginSchema = z.object({
  // Email address or phone number.
  identifier: z.string().trim().min(3).max(200),
  // Password, or a PIN when mode === "pin".
  secret: z.string().min(1).max(200),
  mode: z.enum(["password", "pin"]).default("password"),
  // Restaurant authenticator/recovery code (platform 2FA uses its own step).
  totp: z.string().trim().min(6).max(20).optional(),
  deviceId: z.string().trim().min(8).max(120).optional(),
});
export type UnifiedLoginDto = z.infer<typeof unifiedLoginSchema>;

export const unifiedLoginResponseSchema = z.discriminatedUnion("accountType", [
  z.object({
    accountType: z.literal("restaurant"),
    user: sessionUserSchema,
  }),
  z.object({
    accountType: z.literal("platform"),
    ok: z.literal(true).optional(),
    mfaRequired: z.boolean().optional(),
    mfaToken: z.string().optional(),
  }),
]);
export type UnifiedLoginResponse = z.infer<typeof unifiedLoginResponseSchema>;
