/**
 * PlatformRawDb — raw-SQL wrapper for all platform_* tables.
 *
 * We use $queryRawUnsafe / $executeRawUnsafe because `prisma generate` has not
 * been re-run after the platform migration, so the generated PrismaClient does
 * not expose platformUser / platformSession / etc. at runtime.
 *
 * All column names match the migration SQL exactly.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface RawPlatformUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
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

export interface RawPlatformSession {
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
  user?: { id: string; role: string; status: string };
}

@Injectable()
export class PlatformRawDb {
  constructor(readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // PlatformUser
  // -------------------------------------------------------------------------

  async findUserByEmail(email: string): Promise<RawPlatformUser | null> {
    const rows = await this.prisma.$queryRawUnsafe<RawPlatformUser[]>(
      `SELECT id, name, email, "passwordHash", role,
              "twoFactorSecret", "twoFactorEnabled", "twoFactorLastStep",
              "recoveryCodes", status, "failedAttempts",
              "lockedUntil", "lastLoginAt", "createdAt"
       FROM platform_users WHERE email = $1 LIMIT 1`,
      email,
    );
    return rows[0] ?? null;
  }

  async findUserById(
    id: string,
    select?: string,
  ): Promise<Partial<RawPlatformUser> | null> {
    const cols = select ?? `id, name, email, role, "twoFactorEnabled", "lastLoginAt", "createdAt",
                             "twoFactorSecret", "twoFactorLastStep", "recoveryCodes", status, "failedAttempts", "lockedUntil", "passwordHash"`;
    const rows = await this.prisma.$queryRawUnsafe<Partial<RawPlatformUser>[]>(
      `SELECT ${cols} FROM platform_users WHERE id = $1 LIMIT 1`,
      id,
    );
    if (!rows[0]) throw new Error(`PlatformUser ${id} not found`);
    return rows[0];
  }

  async updateUser(id: string, data: Partial<RawPlatformUser>): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (data.failedAttempts !== undefined) { sets.push(`"failedAttempts" = $${idx++}`); vals.push(data.failedAttempts); }
    if (data.lockedUntil !== undefined) { sets.push(`"lockedUntil" = $${idx++}`); vals.push(data.lockedUntil); }
    if (data.status !== undefined) { sets.push(`status = $${idx++}`); vals.push(data.status); }
    if (data.lastLoginAt !== undefined) { sets.push(`"lastLoginAt" = $${idx++}`); vals.push(data.lastLoginAt); }
    if (data.twoFactorSecret !== undefined) { sets.push(`"twoFactorSecret" = $${idx++}`); vals.push(data.twoFactorSecret); }
    if (data.twoFactorEnabled !== undefined) { sets.push(`"twoFactorEnabled" = $${idx++}`); vals.push(data.twoFactorEnabled); }
    if (data.twoFactorLastStep !== undefined) { sets.push(`"twoFactorLastStep" = $${idx++}`); vals.push(data.twoFactorLastStep); }
    if (data.recoveryCodes !== undefined) { sets.push(`"recoveryCodes" = $${idx++}`); vals.push(data.recoveryCodes); }

    if (sets.length === 0) return;
    vals.push(id);
    await this.prisma.$executeRawUnsafe(
      `UPDATE platform_users SET ${sets.join(', ')} WHERE id = $${idx}`,
      ...vals,
    );
  }

  // -------------------------------------------------------------------------
  // PlatformSession
  // -------------------------------------------------------------------------

  async createSession(data: {
    userId: string;
    refreshTokenHash: string;
    device?: string;
    ip?: string;
    userAgent?: string;
    expiresAt: Date;
  }): Promise<{ id: string }> {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO platform_sessions
         (id, "userId", "refreshTokenHash", device, ip, "userAgent", "createdAt", "lastSeenAt", "expiresAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW(), $6)
       RETURNING id`,
      data.userId,
      data.refreshTokenHash,
      data.device ?? null,
      data.ip ?? null,
      data.userAgent ?? null,
      data.expiresAt,
    );
    return rows[0]!;
  }

  async findSessionByRefreshHash(hash: string): Promise<(RawPlatformSession & { user: { id: string; role: string; status: string } }) | null> {
    const rows = await this.prisma.$queryRawUnsafe<Array<RawPlatformSession & { userId: string; userRole: string; userStatus: string }>>(
      `SELECT s.id, s."userId", s."refreshTokenHash", s.device, s.ip, s."userAgent",
              s."createdAt", s."lastSeenAt", s."expiresAt", s."revokedAt",
              u.role AS "userRole", u.status AS "userStatus"
       FROM platform_sessions s
       JOIN platform_users u ON u.id = s."userId"
       WHERE s."refreshTokenHash" = $1 AND s."revokedAt" IS NULL
       LIMIT 1`,
      hash,
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      ...r,
      user: { id: r.userId, role: r.userRole, status: r.userStatus },
    };
  }

  async findSessionByIp(userId: string, ip: string): Promise<{ id: string } | null> {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM platform_sessions
       WHERE "userId" = $1 AND ip = $2 AND "revokedAt" IS NULL
       LIMIT 1`,
      userId,
      ip,
    );
    return rows[0] ?? null;
  }

  async updateSession(id: string, data: {
    refreshTokenHash?: string;
    lastSeenAt?: Date;
    expiresAt?: Date;
    ip?: string;
    userAgent?: string;
    revokedAt?: Date;
  }): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (data.refreshTokenHash !== undefined) { sets.push(`"refreshTokenHash" = $${idx++}`); vals.push(data.refreshTokenHash); }
    if (data.lastSeenAt !== undefined) { sets.push(`"lastSeenAt" = $${idx++}`); vals.push(data.lastSeenAt); }
    if (data.expiresAt !== undefined) { sets.push(`"expiresAt" = $${idx++}`); vals.push(data.expiresAt); }
    if (data.ip !== undefined) { sets.push(`ip = $${idx++}`); vals.push(data.ip); }
    if (data.userAgent !== undefined) { sets.push(`"userAgent" = $${idx++}`); vals.push(data.userAgent); }
    if (data.revokedAt !== undefined) { sets.push(`"revokedAt" = $${idx++}`); vals.push(data.revokedAt); }

    if (sets.length === 0) return;
    vals.push(id);
    await this.prisma.$executeRawUnsafe(
      `UPDATE platform_sessions SET ${sets.join(', ')} WHERE id = $${idx}`,
      ...vals,
    );
  }

  async revokeSessions(where: { userId: string; id?: string }): Promise<void> {
    if (where.id) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE platform_sessions SET "revokedAt" = NOW()
         WHERE id = $1 AND "userId" = $2 AND "revokedAt" IS NULL`,
        where.id,
        where.userId,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `UPDATE platform_sessions SET "revokedAt" = NOW()
         WHERE "userId" = $1 AND "revokedAt" IS NULL`,
        where.userId,
      );
    }
  }

  async findSessionById(id: string, userId: string): Promise<{ id: string; revokedAt: Date | null } | null> {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string; revokedAt: Date | null }[]>(
      `SELECT id, "revokedAt" FROM platform_sessions WHERE id = $1 AND "userId" = $2 LIMIT 1`,
      id,
      userId,
    );
    return rows[0] ?? null;
  }

  async listActiveSessions(userId: string): Promise<RawPlatformSession[]> {
    return this.prisma.$queryRawUnsafe<RawPlatformSession[]>(
      `SELECT id, "userId", device, ip, "userAgent", "createdAt", "lastSeenAt", "expiresAt", "revokedAt"
       FROM platform_sessions
       WHERE "userId" = $1 AND "revokedAt" IS NULL AND "expiresAt" > NOW()
       ORDER BY "lastSeenAt" DESC`,
      userId,
    );
  }

  // -------------------------------------------------------------------------
  // PlatformAuditLog
  // -------------------------------------------------------------------------

  async createAuditLog(data: {
    actorId?: string;
    action: string;
    entity: string;
    entityId?: string;
    before?: object;
    after?: object;
    ip?: string;
    device?: string;
  }): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO platform_audit_logs
         (id, "actorId", action, entity, "entityId", before, after, ip, device, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, NOW())`,
      data.actorId ?? null,
      data.action,
      data.entity,
      data.entityId ?? null,
      data.before ? JSON.stringify(data.before) : null,
      data.after ? JSON.stringify(data.after) : null,
      data.ip ?? null,
      data.device ?? null,
    );
  }

  async listAuditLogs(params: {
    actorId?: string;
    entity?: string;
    skip?: number;
    take?: number;
  }): Promise<unknown[]> {
    const conditions: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    if (params.actorId) { conditions.push(`"actorId" = $${idx++}`); vals.push(params.actorId); }
    if (params.entity) { conditions.push(`entity = $${idx++}`); vals.push(params.entity); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const skip = params.skip ?? 0;
    const take = params.take ?? 50;
    vals.push(take, skip);

    return this.prisma.$queryRawUnsafe(
      `SELECT * FROM platform_audit_logs ${where} ORDER BY "createdAt" DESC LIMIT $${idx++} OFFSET $${idx}`,
      ...vals,
    );
  }

  // -------------------------------------------------------------------------
  // PlatformAlert
  // -------------------------------------------------------------------------

  async createAlert(data: {
    severity: string;
    type: string;
    message: string;
    userId?: string;
  }): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO platform_alerts (id, severity, type, message, "userId", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
      data.severity,
      data.type,
      data.message,
      data.userId ?? null,
    );
  }
}
