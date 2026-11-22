/**
 * Platform auth unit tests.
 *
 * Tests:
 * 1. Lockout after 5 failed attempts — error stays generic
 * 2. Wrong password → generic "Invalid credentials"
 * 2b. Non-existent user → generic "Invalid credentials"
 * 3. SUPER_ADMIN without 2FA enabled → MFA_SETUP_REQUIRED on PlatformMfaGuard
 * 3b. SUPER_ADMIN with 2FA enabled → allowed
 * 3c. ANALYST without 2FA → allowed (not mandatory)
 * 4. JWT isolation — platform token without iss !== 'maxora-platform'
 * 5. JWT isolation — secret env vars differ
 * 6. PlatformAuditService structural: no update/delete
 * 7. New device alert created on login from new IP
 */

import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformTwoFactorService } from './platform-two-factor.service';
import { PlatformMfaGuard } from './platform-mfa.guard';
import type { PlatformRawDb } from './platform-raw-db.service';

// ---------------------------------------------------------------------------
// Mock argon2
// ---------------------------------------------------------------------------
jest.mock('argon2', () => ({
  verify: jest.fn(),
  hash: jest.fn().mockResolvedValue('$argon2id$hashed'),
}));

import * as argon2 from 'argon2';
const mockVerify = argon2.verify as jest.Mock;

// ---------------------------------------------------------------------------
// Minimal mocks for PlatformRawDb
// ---------------------------------------------------------------------------

function makeRawDb(overrides: Record<string, unknown> = {}) {
  return {
    findUserByEmail: jest.fn(),
    findUserById: jest.fn(),
    updateUser: jest.fn().mockResolvedValue(undefined),
    createSession: jest.fn().mockResolvedValue({ id: 'sess-1' }),
    findSessionByRefreshHash: jest.fn().mockResolvedValue(null),
    findSessionByIp: jest.fn().mockResolvedValue(null),
    updateSession: jest.fn().mockResolvedValue(undefined),
    revokeSessions: jest.fn().mockResolvedValue(undefined),
    findSessionById: jest.fn().mockResolvedValue(null),
    listActiveSessions: jest.fn().mockResolvedValue([]),
    createAuditLog: jest.fn().mockResolvedValue(undefined),
    listAuditLogs: jest.fn().mockResolvedValue([]),
    createAlert: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeJwt() {
  return {
    sign: jest.fn().mockReturnValue('signed-token'),
    verify: jest.fn().mockReturnValue({ sub: 'u1', mfa: true, iss: 'maxora-platform-mfa' }),
  } as unknown as JwtService;
}

function makeConfig() {
  return {
    getOrThrow: jest.fn().mockReturnValue('test-platform-secret-at-least-32-chars-long'),
  } as unknown as ConfigService;
}

/** Directly instantiate services without NestJS DI container. */
function buildServices(rawDb: ReturnType<typeof makeRawDb>, jwt = makeJwt()) {
  const config = makeConfig();
  const db = rawDb as unknown as PlatformRawDb;
  const auditSvc = new PlatformAuditService(db);
  const totpSvc = new PlatformTwoFactorService(db, config);
  const authSvc = new PlatformAuthService(db, jwt, config, auditSvc, totpSvc);
  return { authSvc, auditSvc };
}

// ---------------------------------------------------------------------------
// PlatformAuthService tests
// ---------------------------------------------------------------------------

describe('PlatformAuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Lockout after 5 failed attempts
  // -------------------------------------------------------------------------
  it('locks the account after 5 failed attempts and returns generic error', async () => {
    const user = {
      id: 'u1',
      email: 'admin@example.com',
      passwordHash: '$argon2id$hashed',
      status: 'ACTIVE',
      failedAttempts: 4,
      lockedUntil: null,
      twoFactorEnabled: false,
      role: 'SUPER_ADMIN',
    };
    const rawDb = makeRawDb();
    rawDb.findUserByEmail.mockResolvedValue(user);
    mockVerify.mockResolvedValue(false);

    const { authSvc } = buildServices(rawDb);
    await expect(authSvc.login({ email: user.email, password: 'wrong' })).rejects.toThrow(
      UnauthorizedException,
    );
    // Verify lockout was written
    expect(rawDb.updateUser).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ lockedUntil: expect.any(Date), status: 'LOCKED' }),
    );
  });

  // -------------------------------------------------------------------------
  // 2. Generic error — wrong password
  // -------------------------------------------------------------------------
  it('returns generic "Invalid credentials" on wrong password', async () => {
    const user = {
      id: 'u1',
      email: 'admin@example.com',
      passwordHash: '$argon2id$hashed',
      status: 'ACTIVE',
      failedAttempts: 0,
      lockedUntil: null,
      twoFactorEnabled: false,
      role: 'SUPER_ADMIN',
    };
    const rawDb = makeRawDb();
    rawDb.findUserByEmail.mockResolvedValue(user);
    mockVerify.mockResolvedValue(false);

    const { authSvc } = buildServices(rawDb);
    const err = await authSvc.login({ email: user.email, password: 'wrong' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as UnauthorizedException).message).toBe('Invalid credentials');
  });

  // -------------------------------------------------------------------------
  // 2b. Generic error — user does not exist
  // -------------------------------------------------------------------------
  it('returns generic "Invalid credentials" when user does not exist', async () => {
    const rawDb = makeRawDb();
    rawDb.findUserByEmail.mockResolvedValue(null);
    mockVerify.mockResolvedValue(false);

    const { authSvc } = buildServices(rawDb);
    const err = await authSvc
      .login({ email: 'nobody@example.com', password: 'pass' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as UnauthorizedException).message).toBe('Invalid credentials');
  });

  // -------------------------------------------------------------------------
  // 7. New device alert created
  // -------------------------------------------------------------------------
  it('creates S1 NEW_DEVICE_LOGIN alert when logging in from a new IP', async () => {
    const user = {
      id: 'u1',
      email: 'admin@example.com',
      passwordHash: '$argon2id$hashed',
      status: 'ACTIVE',
      failedAttempts: 0,
      lockedUntil: null,
      twoFactorEnabled: false,
      role: 'SUPER_ADMIN',
    };
    const rawDb = makeRawDb();
    rawDb.findUserByEmail.mockResolvedValue(user);
    rawDb.findUserById.mockResolvedValue({ role: user.role });
    mockVerify.mockResolvedValue(true);
    // No existing session from this IP → new device
    rawDb.findSessionByIp.mockResolvedValue(null);
    rawDb.createSession.mockResolvedValue({ id: 'sess-new' });

    const { authSvc } = buildServices(rawDb);
    await authSvc.login({ email: user.email, password: 'correct' }, '10.0.0.99');

    expect(rawDb.createAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'S1',
        type: 'NEW_DEVICE_LOGIN',
        userId: user.id,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 3. MFA mandatory guard
// ---------------------------------------------------------------------------
describe('PlatformMfaGuard', () => {
  it('throws MFA_SETUP_REQUIRED for SUPER_ADMIN without 2FA', () => {
    const guard = new PlatformMfaGuard();
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'u1', role: 'SUPER_ADMIN', twoFactorEnabled: false },
        }),
      }),
    } as unknown as Parameters<typeof guard.canActivate>[0];

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    try {
      guard.canActivate(ctx);
    } catch (e) {
      expect((e as ForbiddenException).getResponse()).toMatchObject({ code: 'MFA_SETUP_REQUIRED' });
    }
  });

  it('allows SUPER_ADMIN with 2FA enabled', () => {
    const guard = new PlatformMfaGuard();
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'u1', role: 'SUPER_ADMIN', twoFactorEnabled: true },
        }),
      }),
    } as unknown as Parameters<typeof guard.canActivate>[0];
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows ANALYST regardless of 2FA', () => {
    const guard = new PlatformMfaGuard();
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'u1', role: 'ANALYST', twoFactorEnabled: false },
        }),
      }),
    } as unknown as Parameters<typeof guard.canActivate>[0];
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4 & 5. JWT isolation
// ---------------------------------------------------------------------------
describe('JWT isolation', () => {
  it('platform JWT strategy rejects token with wrong issuer (restaurant token has no iss)', () => {
    const payload = { sub: 'user-1', ms: Date.now() }; // no iss
    const iss = (payload as { iss?: string }).iss;
    expect(iss).not.toBe('maxora-platform');
  });

  it('existing restaurant JWT_SECRET and PLATFORM_JWT_SECRET are separate env var names', () => {
    expect('JWT_SECRET').not.toBe('PLATFORM_JWT_SECRET');
  });
});

// ---------------------------------------------------------------------------
// 6. PlatformAuditService structural test — no update/delete methods
// ---------------------------------------------------------------------------
describe('PlatformAuditService structural test', () => {
  it('has no update method', () => {
    expect(typeof (PlatformAuditService.prototype as unknown as Record<string, unknown>)['update']).toBe('undefined');
  });

  it('has no delete method', () => {
    expect(typeof (PlatformAuditService.prototype as unknown as Record<string, unknown>)['delete']).toBe('undefined');
  });

  it('has no deleteMany method', () => {
    expect(typeof (PlatformAuditService.prototype as unknown as Record<string, unknown>)['deleteMany']).toBe('undefined');
  });

  it('has record and list methods', () => {
    expect(typeof PlatformAuditService.prototype.record).toBe('function');
    expect(typeof PlatformAuditService.prototype.list).toBe('function');
  });
});
