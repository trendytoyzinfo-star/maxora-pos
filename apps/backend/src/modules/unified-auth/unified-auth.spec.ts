/**
 * Unified login (/api/auth/unified-login) unit tests.
 *
 * Covers: platform email -> platform token, restaurant email -> restaurant token,
 * same generic failure for every kind of wrong credential, dummy Argon2 verify
 * for unknown users, lockout (unified-login only), platform priority on a clash,
 * PIN mode vs password-only platform accounts, restaurant 2FA pass-through, and
 * that platform / restaurant tokens are rejected by each other's verifier.
 */
import {
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { UnifiedLoginDto } from '@maxora/types';
import { PlatformAuditService } from '../platform/platform-audit.service';
import { PlatformAuthService } from '../platform/platform-auth.service';
import { PlatformJwtStrategy } from '../platform/platform-jwt.strategy';
import type { PlatformRawDb } from '../platform/platform-raw-db.service';
import { PlatformTwoFactorService } from '../platform/platform-two-factor.service';
import { UnifiedAuthService } from './unified-auth.service';

jest.mock('argon2', () => ({
  verify: jest.fn(),
  hash: jest.fn().mockResolvedValue('$argon2id$dummy'),
}));
// bcrypt is only used for the timing-padding compare in PIN mode.
jest.mock('bcrypt', () => ({ compare: jest.fn().mockResolvedValue(false) }));

import * as argon2 from 'argon2';
const mockVerify = argon2.verify as jest.Mock;

const PLATFORM_EMAIL = 'sample1@gmail.com';
const PLATFORM_PASSWORD = 'PlatformPass1!';
const RESTAURANT_EMAIL = 'owner@demo.local';
const RESTAURANT_PASSWORD = 'Password123!';
const GENERIC = 'Invalid credentials';

const platformUser = {
  id: 'p1',
  name: 'Super Admin',
  email: PLATFORM_EMAIL,
  passwordHash: '$argon2id$real',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  failedAttempts: 0,
  lockedUntil: null,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  twoFactorLastStep: null,
  recoveryCodes: [],
  lastLoginAt: null,
  createdAt: new Date(),
};

const sessionUser = {
  id: 'r1',
  restaurantId: 'rest1',
  name: 'Owner',
  roleId: 'role1',
  roleName: 'OWNER',
  permissions: [],
};

function build(opts: { platformUsers?: Array<typeof platformUser>; require2fa?: boolean } = {}) {
  const users = opts.platformUsers ?? [platformUser];
  const rawDb = {
    findUserByEmail: jest.fn(async (e: string) => users.find((u) => u.email === e) ?? null),
    findUserById: jest.fn().mockResolvedValue({ role: 'SUPER_ADMIN' }),
    updateUser: jest.fn().mockResolvedValue(undefined),
    createSession: jest.fn().mockResolvedValue({ id: 'sess-1' }),
    findSessionByIp: jest.fn().mockResolvedValue({ id: 'known-ip' }),
    createAuditLog: jest.fn().mockResolvedValue(undefined),
    createAlert: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: jest.fn((k: string) => (k === 'PLATFORM_REQUIRE_2FA' ? String(!!opts.require2fa) : undefined)),
    getOrThrow: jest.fn().mockReturnValue('platform-secret-at-least-32-characters-long'),
  } as unknown as ConfigService;
  const jwt = { sign: jest.fn().mockReturnValue('platform-signed-token') } as unknown as JwtService;
  const db = rawDb as unknown as PlatformRawDb;
  const platformAudit = new PlatformAuditService(db);
  const platform = new PlatformAuthService(
    db,
    jwt,
    config,
    platformAudit,
    new PlatformTwoFactorService(db, config),
  );

  const restaurantAuth = {
    login: jest.fn(async (dto: { email: string; password: string }) => {
      if (dto.email === RESTAURANT_EMAIL && dto.password === RESTAURANT_PASSWORD) {
        return { token: 'restaurant-signed-token', user: sessionUser };
      }
      throw new UnauthorizedException('Invalid login ID or password');
    }),
    pinLogin: jest.fn().mockRejectedValue(new UnauthorizedException('Incorrect PIN')),
  };
  const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const svc = new UnifiedAuthService(
    platform,
    restaurantAuth as never,
    prisma as never,
    audit as never,
  );
  return { svc, rawDb, restaurantAuth, prisma, audit };
}

const dto = (identifier: string, secret: string, extra: Partial<UnifiedLoginDto> = {}): UnifiedLoginDto => ({
  identifier,
  secret,
  mode: 'password',
  ...extra,
});

describe('UnifiedAuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerify.mockImplementation(
      async (hash: string, pw: string) => hash === '$argon2id$real' && pw === PLATFORM_PASSWORD,
    );
  });

  it('platform email + password -> platform account and platform session', async () => {
    const { svc, rawDb, restaurantAuth } = build();
    const out = await svc.login(dto(PLATFORM_EMAIL, PLATFORM_PASSWORD), '10.0.0.1');
    expect(out.accountType).toBe('platform');
    if (out.accountType === 'platform') {
      expect(out.result).toMatchObject({ type: 'success', accessToken: 'platform-signed-token' });
    }
    expect(rawDb.createSession).toHaveBeenCalled();
    // platform audit goes to PlatformAuditLog
    expect(rawDb.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN_SUCCESS', entity: 'PlatformUser' }),
    );
    // restaurant side never issued anything for this password
    expect(restaurantAuth.login).toHaveBeenCalledTimes(1);
  });

  it('restaurant email + password -> restaurant token, audited in the existing audit log', async () => {
    const { svc, rawDb, audit } = build();
    const out = await svc.login(dto(RESTAURANT_EMAIL, RESTAURANT_PASSWORD), '10.0.0.2');
    expect(out).toMatchObject({
      accountType: 'restaurant',
      token: 'restaurant-signed-token',
      user: { id: 'r1' },
    });
    expect(rawDb.createSession).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'r1', action: 'LOGIN', entity: 'User' }),
    );
    expect(rawDb.createAuditLog).not.toHaveBeenCalled();
  });

  it('every wrong-credential case returns the same generic message', async () => {
    const messages: string[] = [];
    for (const [id, pw] of [
      [PLATFORM_EMAIL, 'wrong-password'], // platform exists
      [RESTAURANT_EMAIL, 'wrong-password'], // restaurant exists
      ['nobody@nowhere.test', 'wrong-password'], // unknown
      ['+919999999999', 'wrong-password'], // unknown phone
    ]) {
      const { svc } = build();
      const err = await svc.login(dto(id as string, pw as string)).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UnauthorizedException);
      messages.push((err as UnauthorizedException).message);
    }
    expect(new Set(messages)).toEqual(new Set([GENERIC]));
  });

  it('still runs a real Argon2 verify (dummy hash) when the user does not exist', async () => {
    const { svc } = build();
    await svc.login(dto('nobody@nowhere.test', 'whatever')).catch(() => undefined);
    expect(mockVerify).toHaveBeenCalledWith('$argon2id$dummy', 'whatever');
  });

  it('runs the Argon2 dummy verify for phone logins and PIN mode too', async () => {
    const { svc } = build();
    await svc.login(dto('+919999999999', 'x1x1x1')).catch(() => undefined);
    await svc.login(dto(PLATFORM_EMAIL, '1234', { mode: 'pin' })).catch(() => undefined);
    expect(mockVerify).toHaveBeenCalledTimes(2);
    expect(mockVerify).toHaveBeenNthCalledWith(1, '$argon2id$dummy', 'x1x1x1');
    expect(mockVerify).toHaveBeenNthCalledWith(2, '$argon2id$dummy', '1234');
  });

  it('locks an identifier after 5 failures (even the right password is refused) and the platform account too', async () => {
    const { svc, rawDb } = build();
    for (let i = 0; i < 5; i++) {
      await svc.login(dto(PLATFORM_EMAIL, `bad-${i}`)).catch(() => undefined);
    }
    // platform's own failure counter moved too (DB-backed lockout stays in force)
    expect(rawDb.updateUser).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ failedAttempts: 1 }),
    );
    const err = await svc.login(dto(PLATFORM_EMAIL, PLATFORM_PASSWORD)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as UnauthorizedException).message).toBe(GENERIC);
  });

  it('lockout also applies to restaurant identifiers and to unknown ones alike', async () => {
    const { svc } = build();
    for (const id of [RESTAURANT_EMAIL, 'ghost@nowhere.test']) {
      for (let i = 0; i < 5; i++) {
        await svc.login(dto(id, `bad-${i}`)).catch(() => undefined);
      }
    }
    const err = await svc.login(dto(RESTAURANT_EMAIL, RESTAURANT_PASSWORD)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as UnauthorizedException).message).toBe(GENERIC);
  });

  it('a success clears earlier failures', async () => {
    const { svc } = build();
    for (let i = 0; i < 4; i++) await svc.login(dto(RESTAURANT_EMAIL, `bad-${i}`)).catch(() => undefined);
    await expect(svc.login(dto(RESTAURANT_EMAIL, RESTAURANT_PASSWORD))).resolves.toMatchObject({
      accountType: 'restaurant',
    });
    for (let i = 0; i < 4; i++) await svc.login(dto(RESTAURANT_EMAIL, `bad-${i}`)).catch(() => undefined);
    await expect(svc.login(dto(RESTAURANT_EMAIL, RESTAURANT_PASSWORD))).resolves.toMatchObject({
      accountType: 'restaurant',
    });
  });

  it('platform takes priority (with a log warning, no password) when both accounts match', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { svc, restaurantAuth } = build();
    restaurantAuth.login.mockResolvedValue({ token: 'restaurant-signed-token', user: sessionUser });
    const out = await svc.login(dto(PLATFORM_EMAIL, PLATFORM_PASSWORD));
    expect(out.accountType).toBe('platform');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(PLATFORM_PASSWORD);
    warn.mockRestore();
  });

  it('same e-mail in both systems: the account whose password matches opens', async () => {
    const shared = { ...platformUser, email: RESTAURANT_EMAIL };
    const { svc } = build({ platformUsers: [shared] });
    // restaurant password (platform hash does not match it) -> restaurant
    await expect(svc.login(dto(RESTAURANT_EMAIL, RESTAURANT_PASSWORD))).resolves.toMatchObject({
      accountType: 'restaurant',
    });
    // platform password -> platform
    await expect(svc.login(dto(RESTAURANT_EMAIL, PLATFORM_PASSWORD))).resolves.toMatchObject({
      accountType: 'platform',
    });
  });

  it('PIN mode never opens a password-only platform account (generic failure)', async () => {
    const { svc, rawDb } = build();
    const err = await svc
      .login(dto(PLATFORM_EMAIL, PLATFORM_PASSWORD, { mode: 'pin' }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as UnauthorizedException).message).toBe(GENERIC);
    expect(rawDb.createSession).not.toHaveBeenCalled();
  });

  it('restaurant two-factor requirement is passed through after a correct password', async () => {
    const { svc, restaurantAuth } = build();
    restaurantAuth.login.mockRejectedValueOnce(new UnauthorizedException('TWO_FACTOR_REQUIRED'));
    const err = await svc.login(dto(RESTAURANT_EMAIL, RESTAURANT_PASSWORD)).catch((e: unknown) => e);
    expect((err as UnauthorizedException).message).toBe('TWO_FACTOR_REQUIRED');
  });

  it('a removed phone is reported only when the restaurant password was right', async () => {
    const { svc, restaurantAuth } = build();
    restaurantAuth.login.mockRejectedValueOnce(
      new ForbiddenException({ message: 'This phone was removed by the owner.', code: 'DEVICE_REVOKED' }),
    );
    await expect(svc.login(dto(RESTAURANT_EMAIL, RESTAURANT_PASSWORD))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('PLATFORM_REQUIRE_2FA=true: platform login with 2FA returns an MFA step inside the same flow', async () => {
    const { svc, rawDb } = build({
      platformUsers: [{ ...platformUser, twoFactorEnabled: true }],
      require2fa: true,
    });
    const out = await svc.login(dto(PLATFORM_EMAIL, PLATFORM_PASSWORD));
    expect(out).toMatchObject({ accountType: 'platform', result: { type: 'mfa_required' } });
    expect(rawDb.createSession).not.toHaveBeenCalled();
  });

  it('a platform account whose lockout window has passed can sign in again', async () => {
    const { svc } = build({
      platformUsers: [{ ...platformUser, status: 'LOCKED', lockedUntil: new Date(Date.now() - 1000) as never }],
    });
    await expect(svc.login(dto(PLATFORM_EMAIL, PLATFORM_PASSWORD))).resolves.toMatchObject({
      accountType: 'platform',
    });
  });
});

describe('platform and restaurant tokens stay separate', () => {
  const restaurantJwt = new JwtService({ secret: 'restaurant-secret-restaurant-secret-0001' });
  const platformJwt = new JwtService({ secret: 'platform-secret-platform-secret-000002' });

  it('a restaurant token fails platform verification', () => {
    const token = restaurantJwt.sign({ sub: 'r1', ms: Date.now() });
    expect(() => platformJwt.verify(token)).toThrow();
  });

  it('a platform token fails restaurant verification', () => {
    const token = platformJwt.sign({ sub: 'p1', sid: 's1', iss: 'maxora-platform', ms: Date.now() });
    expect(() => restaurantJwt.verify(token)).toThrow();
  });

  it('the platform strategy rejects a payload that is not issued by the platform', async () => {
    const strategy = new PlatformJwtStrategy(
      { getOrThrow: () => 'platform-secret-platform-secret-000002' } as unknown as ConfigService,
      {} as unknown as PlatformRawDb,
    );
    await expect(
      strategy.validate({ sub: 'r1', sid: 'x', role: 'OWNER', iss: 'something-else', ms: 1 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
