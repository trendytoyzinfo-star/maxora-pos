-- Platform auth tables — completely separate from restaurant users.
-- Additive only: does not modify any existing table.

-- PlatformRole enum
CREATE TYPE "PlatformRole" AS ENUM (
  'SUPER_ADMIN',
  'PLATFORM_ADMIN',
  'SUPPORT_AGENT',
  'BILLING_MANAGER',
  'ANALYST'
);

-- PlatformUser
CREATE TABLE "platform_users" (
  "id"                TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "email"             TEXT NOT NULL,
  "passwordHash"      TEXT NOT NULL,
  "role"              "PlatformRole" NOT NULL DEFAULT 'SUPPORT_AGENT',
  "twoFactorSecret"   TEXT,
  "twoFactorEnabled"  BOOLEAN NOT NULL DEFAULT FALSE,
  "twoFactorLastStep" INTEGER,
  "recoveryCodes"     TEXT[] NOT NULL DEFAULT '{}',
  "status"            TEXT NOT NULL DEFAULT 'ACTIVE',
  "failedAttempts"    INTEGER NOT NULL DEFAULT 0,
  "lockedUntil"       TIMESTAMP(3),
  "lastLoginAt"       TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

-- PlatformSession
CREATE TABLE "platform_sessions" (
  "id"               TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "device"           TEXT,
  "ip"               TEXT,
  "userAgent"        TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"        TIMESTAMP(3) NOT NULL,
  "revokedAt"        TIMESTAMP(3),

  CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_sessions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "platform_users"("id") ON DELETE CASCADE
);
CREATE INDEX "platform_sessions_userId_idx" ON "platform_sessions"("userId");

-- PlatformAuditLog
CREATE TABLE "platform_audit_logs" (
  "id"        TEXT NOT NULL,
  "actorId"   TEXT,
  "action"    TEXT NOT NULL,
  "entity"    TEXT NOT NULL,
  "entityId"  TEXT,
  "before"    JSONB,
  "after"     JSONB,
  "ip"        TEXT,
  "device"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_audit_logs_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "platform_users"("id") ON DELETE SET NULL
);
CREATE INDEX "platform_audit_logs_actorId_idx" ON "platform_audit_logs"("actorId");
CREATE INDEX "platform_audit_logs_createdAt_idx" ON "platform_audit_logs"("createdAt");

-- PlatformAlert
CREATE TABLE "platform_alerts" (
  "id"         TEXT NOT NULL,
  "severity"   TEXT NOT NULL,
  "type"       TEXT NOT NULL,
  "message"    TEXT NOT NULL,
  "userId"     TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),

  CONSTRAINT "platform_alerts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_alerts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "platform_users"("id") ON DELETE SET NULL
);
CREATE INDEX "platform_alerts_userId_idx" ON "platform_alerts"("userId");
