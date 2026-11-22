import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformTwoFactorService } from './platform-two-factor.service';
import { PlatformRawDb, type RawPlatformUser } from './platform-raw-db.service';
import type { PlatformLoginDto, PlatformTotpDto, PlatformRecoveryDto } from '@maxora/types';

const ACCESS_TOKEN_EXPIRES_S = 15 * 60; // 15 min
const REFRESH_TOKEN_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MFA_TOKEN_EXPIRES_S = 5 * 60; // 5 min
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 min
const PLATFORM_ISS = 'maxora-platform';
const MFA_ISS = 'maxora-platform-mfa';

let dummyHashPromise: Promise<string> | null = null;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken(): string {
  return randomBytes(40).toString('base64url');
}

@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly rawDb: PlatformRawDb,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: PlatformAuditService,
    private readonly totp: PlatformTwoFactorService,
  ) {}

  private get platformSecret(): string {
    return this.config.getOrThrow<string>('PLATFORM_JWT_SECRET');
  }

  get isTwoFactorRequired(): boolean {
    return this.config.get<string>('PLATFORM_REQUIRE_2FA') === 'true';
  }

  private async verifyPassword(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  private issueAccessToken(userId: string, sessionId: string, role: string): string {
    return this.jwt.sign(
      { sub: userId, sid: sessionId, role, iss: PLATFORM_ISS, ms: Date.now() },
      { secret: this.platformSecret, expiresIn: ACCESS_TOKEN_EXPIRES_S },
    );
  }

  private issueMfaToken(userId: string): string {
    return this.jwt.sign(
      { sub: userId, mfa: true, iss: MFA_ISS },
      { secret: this.platformSecret, expiresIn: MFA_TOKEN_EXPIRES_S },
    );
  }

  private verifyMfaToken(token: string): { sub: string } {
    try {
      const payload = this.jwt.verify<{ sub: string; mfa: boolean; iss: string }>(token, {
        secret: this.platformSecret,
      });
      if (payload.iss !== MFA_ISS || !payload.mfa) {
        throw new UnauthorizedException('Invalid MFA token');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }
  }

  private async detectNewDevice(userId: string, ip: string | undefined): Promise<boolean> {
    if (!ip) return false;
    const existing = await this.rawDb.findSessionByIp(userId, ip);
    return existing === null;
  }

  private async createSession(
    userId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_MS);

    const session = await this.rawDb.createSession({
      userId,
      refreshTokenHash: hashToken(refreshToken),
      ip,
      userAgent,
      device: userAgent ? userAgent.slice(0, 200) : undefined,
      expiresAt,
    });

    const user = await this.rawDb.findUserById(userId, 'role');
    const role = (user as { role: string }).role;

    const accessToken = this.issueAccessToken(userId, session.id, role);
    return { accessToken, refreshToken, sessionId: session.id };
  }

  // ---------------------------------------------------------------------------
  // Login
  //
  // Split into three steps so the unified /login endpoint can decide between a
  // platform and a restaurant account without side effects on the wrong one:
  //   verifyCredentials -> (no writes) real Argon2 verify, dummy hash if unusable
  //   completeLogin     -> success path (reset counters, alert, audit, session/MFA)
  //   recordFailure     -> failure path (counter, lockout, audit)
  // ---------------------------------------------------------------------------

  private isLocked(user: RawPlatformUser): boolean {
    return !!user.lockedUntil && user.lockedUntil > new Date();
  }

  /** A LOCKED status whose lockout window has passed is usable again. */
  private isUsable(user: RawPlatformUser): boolean {
    if (this.isLocked(user)) return false;
    return user.status === 'ACTIVE' || user.status === 'LOCKED';
  }

  private getDummyHash(): Promise<string> {
    // A real Argon2 hash (random password) so a verify against it costs the
    // same as verifying a real account — a malformed hash would fail fast and
    // leak, through response time, that the e-mail is unknown.
    dummyHashPromise ??= argon2.hash(randomBytes(16).toString('hex'));
    return dummyHashPromise;
  }

  /** Spend one real Argon2 verify (against a dummy hash) — keeps timing flat when no platform lookup applies. */
  async burnVerify(password: string): Promise<void> {
    await this.verifyPassword(await this.getDummyHash(), password).catch(() => false);
  }

  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<{ user: RawPlatformUser | null; valid: boolean }> {
    const user = await this.rawDb.findUserByEmail(email);
    const usable = !!user && this.isUsable(user);
    const hash = usable && user ? user.passwordHash : await this.getDummyHash();
    const matches = await this.verifyPassword(hash, password).catch(() => false);
    return { user, valid: usable && matches };
  }

  async recordFailure(user: RawPlatformUser, ip?: string, userAgent?: string): Promise<void> {
    if (this.isLocked(user)) {
      await this.audit.record({
        actorId: user.id,
        action: 'LOGIN_ATTEMPT_LOCKED',
        entity: 'PlatformUser',
        entityId: user.id,
        ip,
        device: userAgent,
      });
      return;
    }
    const attempts = user.failedAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    await this.rawDb.updateUser(user.id, {
      failedAttempts: attempts,
      ...(shouldLock
        ? { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS), status: 'LOCKED' }
        : {}),
    });
    await this.audit.record({
      actorId: user.id,
      action: shouldLock ? 'LOGIN_LOCKOUT' : 'LOGIN_FAILED',
      entity: 'PlatformUser',
      entityId: user.id,
      ip,
      device: userAgent,
    });
  }

  async completeLogin(
    user: RawPlatformUser,
    ip?: string,
    userAgent?: string,
  ): Promise<
    | { type: 'mfa_required'; mfaToken: string }
    | { type: 'success'; accessToken: string; refreshToken: string }
  > {
    // Reset failure counter on success
    await this.rawDb.updateUser(user.id, {
      failedAttempts: 0,
      lockedUntil: null,
      status: 'ACTIVE',
      lastLoginAt: new Date(),
    });

    // Detect new device / IP
    const isNewDevice = await this.detectNewDevice(user.id, ip);
    if (isNewDevice) {
      await this.rawDb.createAlert({
        severity: 'S1',
        type: 'NEW_DEVICE_LOGIN',
        message: `New device login for ${user.email} from IP ${ip ?? 'unknown'}`,
        userId: user.id,
      });
    }

    await this.audit.record({
      actorId: user.id,
      action: 'LOGIN_SUCCESS',
      entity: 'PlatformUser',
      entityId: user.id,
      ip,
      device: userAgent,
    });

    // If server requires 2FA and user has 2FA enabled → return MFA token, don't issue a session yet
    if (this.isTwoFactorRequired && user.twoFactorEnabled) {
      return { type: 'mfa_required', mfaToken: this.issueMfaToken(user.id) };
    }

    const { accessToken, refreshToken } = await this.createSession(user.id, ip, userAgent);
    return { type: 'success', accessToken, refreshToken };
  }

  async login(
    dto: PlatformLoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<
    | { type: 'mfa_required'; mfaToken: string }
    | { type: 'success'; accessToken: string; refreshToken: string }
  > {
    const genericError = 'Invalid credentials';
    const { user, valid } = await this.verifyCredentials(dto.email, dto.password);
    if (!user) throw new UnauthorizedException(genericError);
    if (!valid) {
      await this.recordFailure(user, ip, userAgent);
      throw new UnauthorizedException(genericError);
    }
    return this.completeLogin(user, ip, userAgent);
  }

  // ---------------------------------------------------------------------------
  // 2FA verify (after login)
  // ---------------------------------------------------------------------------

  async verifyTotp(
    dto: PlatformTotpDto,
    ip?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { sub: userId } = this.verifyMfaToken(dto.mfaToken);

    const user = await this.rawDb.findUserById(
      userId,
      `"twoFactorSecret", "twoFactorEnabled", "twoFactorLastStep"`,
    ) as { twoFactorSecret: string | null; twoFactorEnabled: boolean; twoFactorLastStep: number | null };

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException('2FA not enabled');
    }

    const secret = this.totp.openSecret(user.twoFactorSecret);
    await this.totp.verifyLogin(userId, secret, dto.code, user.twoFactorLastStep ?? null);

    await this.audit.record({
      actorId: userId,
      action: '2FA_VERIFY_SUCCESS',
      entity: 'PlatformUser',
      entityId: userId,
      ip,
      device: userAgent,
    });

    const { accessToken, refreshToken } = await this.createSession(userId, ip, userAgent);
    return { accessToken, refreshToken };
  }

  // ---------------------------------------------------------------------------
  // Recovery code (after login)
  // ---------------------------------------------------------------------------

  async verifyRecovery(
    dto: PlatformRecoveryDto,
    ip?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { sub: userId } = this.verifyMfaToken(dto.mfaToken);

    const user = await this.rawDb.findUserById(userId, `"recoveryCodes"`) as { recoveryCodes: string[] };
    await this.totp.consumeRecoveryCode(userId, user.recoveryCodes, dto.code);

    await this.audit.record({
      actorId: userId,
      action: '2FA_RECOVERY_USED',
      entity: 'PlatformUser',
      entityId: userId,
      ip,
      device: userAgent,
    });

    const { accessToken, refreshToken } = await this.createSession(userId, ip, userAgent);
    return { accessToken, refreshToken };
  }

  // ---------------------------------------------------------------------------
  // Refresh token rotation
  // ---------------------------------------------------------------------------

  async refresh(
    refreshToken: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const hash = hashToken(refreshToken);
    const session = await this.rawDb.findSessionByRefreshHash(hash);

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!session.user || session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    const newRefreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_MS);

    await this.rawDb.updateSession(session.id, {
      refreshTokenHash: hashToken(newRefreshToken),
      lastSeenAt: new Date(),
      expiresAt,
      ip,
      userAgent,
    });

    const accessToken = this.issueAccessToken(session.userId, session.id, session.user?.role ?? '');
    return { accessToken, refreshToken: newRefreshToken };
  }

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------

  async logout(sessionId: string, actorId: string, ip?: string): Promise<void> {
    await this.rawDb.revokeSessions({ userId: actorId, id: sessionId });
    await this.audit.record({
      actorId,
      action: 'LOGOUT',
      entity: 'PlatformSession',
      entityId: sessionId,
      ip,
    });
  }

  async logoutAll(actorId: string, ip?: string): Promise<void> {
    await this.rawDb.revokeSessions({ userId: actorId });
    await this.audit.record({
      actorId,
      action: 'LOGOUT_ALL',
      entity: 'PlatformSession',
      ip,
    });
  }

  // ---------------------------------------------------------------------------
  // /me and sessions
  // ---------------------------------------------------------------------------

  async getMe(userId: string) {
    const user = await this.rawDb.findUserById(
      userId,
      `id, name, email, role, "twoFactorEnabled", "lastLoginAt", "createdAt"`,
    );
    return {
      ...user,
      require2fa: this.isTwoFactorRequired,
    };
  }

  async getSessions(userId: string) {
    return this.rawDb.listActiveSessions(userId);
  }

  async revokeSession(userId: string, sessionId: string, ip?: string): Promise<void> {
    const session = await this.rawDb.findSessionById(sessionId, userId);
    if (!session) throw new NotFoundException('Session not found');

    await this.rawDb.updateSession(sessionId, { revokedAt: new Date() });
    await this.audit.record({
      actorId: userId,
      action: 'SESSION_REVOKED',
      entity: 'PlatformSession',
      entityId: sessionId,
      ip,
    });
  }

  // ---------------------------------------------------------------------------
  // 2FA setup (authenticated)
  // ---------------------------------------------------------------------------

  async setup2fa(userId: string) {
    const result = await this.totp.setup(userId);
    await this.audit.record({
      actorId: userId,
      action: '2FA_SETUP_INITIATED',
      entity: 'PlatformUser',
      entityId: userId,
    });
    return result;
  }

  async confirm2fa(userId: string, code: string) {
    const result = await this.totp.enable(userId, code);
    await this.audit.record({
      actorId: userId,
      action: '2FA_ENABLED',
      entity: 'PlatformUser',
      entityId: userId,
    });
    return result;
  }

  // ---------------------------------------------------------------------------
  // Unused — kept for interface compatibility with timingSafeEqual usage
  // ---------------------------------------------------------------------------
  private _timingSafeEqual(a: Buffer, b: Buffer): boolean {
    return timingSafeEqual(a, b);
  }
}
