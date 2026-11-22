/**
 * Platform Prisma types — manually maintained until `prisma generate` can run.
 * These mirror the new platform_* tables added in migration 20261122060000_add_platform_auth.
 * Once `prisma generate` has been run with the updated schema, this file can be deleted.
 */

export type PlatformRoleEnum =
  | 'SUPER_ADMIN'
  | 'PLATFORM_ADMIN'
  | 'SUPPORT_AGENT'
  | 'BILLING_MANAGER'
  | 'ANALYST';

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: PlatformRoleEnum;
  twoFactorSecret: string | null;
  twoFactorEnabled: boolean;
  twoFactorLastStep: number | null;
  recoveryCodes: string[];
  status: string;
  failedAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface PlatformSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  device: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  user?: PlatformUser;
}

export interface PlatformAuditLog {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  device: string | null;
  createdAt: Date;
}

export interface PlatformAlert {
  id: string;
  severity: string;
  type: string;
  message: string;
  userId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

// Generic Prisma-like delegate interface for CRUD operations
export interface PlatformUserDelegate {
  findUnique(args: { where: Partial<PlatformUser>; select?: Partial<Record<keyof PlatformUser, boolean>> }): Promise<PlatformUser | null>;
  findUniqueOrThrow(args: { where: Partial<PlatformUser>; select?: Partial<Record<keyof PlatformUser, boolean>> }): Promise<PlatformUser>;
  findFirst(args: { where: Partial<PlatformUser> }): Promise<PlatformUser | null>;
  findMany(args?: { where?: Partial<PlatformUser>; orderBy?: Partial<Record<keyof PlatformUser, 'asc' | 'desc'>>; skip?: number; take?: number; select?: Partial<Record<keyof PlatformUser, boolean>> }): Promise<PlatformUser[]>;
  create(args: { data: Partial<PlatformUser> }): Promise<PlatformUser>;
  update(args: { where: Partial<PlatformUser>; data: Partial<PlatformUser> }): Promise<PlatformUser>;
  updateMany(args: { where: Partial<PlatformUser>; data: Partial<PlatformUser> }): Promise<{ count: number }>;
  delete(args: { where: Partial<PlatformUser> }): Promise<PlatformUser>;
}

export interface PlatformSessionDelegate {
  findUnique(args: { where: Partial<PlatformSession>; include?: { user?: boolean } }): Promise<PlatformSession | null>;
  findFirst(args: { where?: Partial<PlatformSession>; include?: { user?: unknown } }): Promise<PlatformSession | null>;
  findMany(args?: { where?: Partial<PlatformSession>; orderBy?: Partial<Record<keyof PlatformSession, 'asc' | 'desc'>>; select?: Partial<Record<keyof PlatformSession, boolean>> }): Promise<PlatformSession[]>;
  create(args: { data: Partial<PlatformSession> }): Promise<PlatformSession>;
  update(args: { where: Partial<PlatformSession>; data: Partial<PlatformSession> }): Promise<PlatformSession>;
  updateMany(args: { where: Partial<PlatformSession>; data: Partial<PlatformSession> }): Promise<{ count: number }>;
}

export interface PlatformAuditLogDelegate {
  create(args: { data: Partial<PlatformAuditLog> }): Promise<PlatformAuditLog>;
  findMany(args?: { where?: Partial<PlatformAuditLog>; orderBy?: Partial<Record<keyof PlatformAuditLog, 'asc' | 'desc'>>; skip?: number; take?: number }): Promise<PlatformAuditLog[]>;
}

export interface PlatformAlertDelegate {
  create(args: { data: Partial<PlatformAlert> }): Promise<PlatformAlert>;
}

/** Augmented PrismaService type that includes platform tables. */
export interface PrismaServiceWithPlatform {
  platformUser: PlatformUserDelegate;
  platformSession: PlatformSessionDelegate;
  platformAuditLog: PlatformAuditLogDelegate;
  platformAlert: PlatformAlertDelegate;
}
