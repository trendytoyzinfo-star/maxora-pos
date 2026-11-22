import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { SessionUser, UnifiedLoginDto } from '@maxora/types';
import { AuthService } from '../../auth/auth.service';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformAuthService } from '../platform/platform-auth.service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_TRACKED_IDENTIFIERS = 5000;
const GENERIC_ERROR = 'Invalid credentials';
// Same shape as the one in AuthService.login — a bcrypt compare that always fails but costs the same.
const DUMMY_BCRYPT_HASH =
  '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';

type PlatformResult = Awaited<ReturnType<PlatformAuthService['completeLogin']>>;

export type UnifiedLoginResult =
  | { accountType: 'platform'; result: PlatformResult }
  | { accountType: 'restaurant'; token: string; user: SessionUser };

type RestaurantOutcome =
  | { kind: 'ok'; token: string; user: SessionUser }
  | { kind: 'needs2fa' }
  | { kind: 'fail'; forbidden?: ForbiddenException };

/**
 * One sign-in entry for restaurant staff and platform (Super Admin) accounts.
 *
 * It only ROUTES to the two existing, separate auth systems — it does not
 * change either one. Platform accounts keep their own JWT secret, cookies and
 * audit log; restaurant accounts keep AuthService.login / pinLogin unchanged.
 * The lockout below lives only here (in memory, keyed by the typed identifier,
 * so unknown identifiers lock exactly like real ones and reveal nothing).
 */
@Injectable()
export class UnifiedAuthService {
  private readonly logger = new Logger(UnifiedAuthService.name);
  private readonly failures = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    private readonly platform: PlatformAuthService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: UnifiedLoginDto, ip?: string, userAgent?: string): Promise<UnifiedLoginResult> {
    const id = dto.identifier.trim();
    const key = id.toLowerCase();
    const locked = this.isLocked(key);

    // --- Platform leg: email + password only. Always spends one real Argon2
    // verify (a dummy hash when the account is missing / unusable / not in
    // password mode) so timing never reveals whether the e-mail exists.
    let platformUser: Awaited<ReturnType<PlatformAuthService['verifyCredentials']>>['user'] = null;
    let platformValid = false;
    if (dto.mode === 'password' && id.includes('@')) {
      const pv = await this.platform.verifyCredentials(id, dto.secret);
      platformUser = pv.user;
      platformValid = pv.valid;
    } else {
      await this.platform.burnVerify(dto.secret);
    }

    // --- Restaurant leg: the existing logic, untouched.
    const restaurant = await this.restaurantAttempt(dto, id);

    // A locked identifier gets the same generic failure, after the same work.
    if (locked) throw new UnauthorizedException(GENERIC_ERROR);

    const restaurantOk = restaurant.kind === 'ok';
    if (platformValid && platformUser) {
      if (restaurantOk) {
        this.logger.warn(
          `Identifier ${this.mask(id)} matches BOTH a platform and a restaurant account with the same credentials; platform account takes priority.`,
        );
      }
      this.failures.delete(key);
      return {
        accountType: 'platform',
        result: await this.platform.completeLogin(platformUser, ip, userAgent),
      };
    }

    if (restaurant.kind === 'ok') {
      this.failures.delete(key);
      await this.auditRestaurantLogin(restaurant.user.id, ip);
      return { accountType: 'restaurant', token: restaurant.token, user: restaurant.user };
    }

    // The password was right but a verification code is needed (existing restaurant behaviour).
    if (restaurant.kind === 'needs2fa') {
      throw new UnauthorizedException('TWO_FACTOR_REQUIRED');
    }
    if (restaurant.forbidden) throw restaurant.forbidden;

    // --- Failure: same message, no hint which side (if any) knew the account.
    if (platformUser) await this.platform.recordFailure(platformUser, ip, userAgent);
    const justLocked = this.recordFailure(key);
    if (justLocked && !platformUser) {
      await this.audit
        .record({
          userId: null,
          action: 'LOGIN_LOCKOUT',
          entity: 'User',
          metadata: { via: 'unified-login', ip: ip ?? null },
        })
        .catch(() => undefined);
    }
    throw new UnauthorizedException(GENERIC_ERROR);
  }

  // -------------------------------------------------------------------------

  private async restaurantAttempt(dto: UnifiedLoginDto, id: string): Promise<RestaurantOutcome> {
    try {
      if (dto.mode === 'pin') {
        return (await this.restaurantPin(id, dto.secret)) ?? { kind: 'fail' };
      }
      const { token, user } = await this.auth.login({
        email: id,
        password: dto.secret,
        totp: dto.totp,
        deviceId: dto.deviceId,
      });
      return { kind: 'ok', token, user };
    } catch (err) {
      if (err instanceof UnauthorizedException && err.message === 'TWO_FACTOR_REQUIRED') {
        return { kind: 'needs2fa' };
      }
      if (err instanceof ForbiddenException) return { kind: 'fail', forbidden: err };
      return { kind: 'fail' };
    }
  }

  /** PIN mode: the existing pinLogin, tried against each active account that has a PIN for this login ID. */
  private async restaurantPin(id: string, pin: string): Promise<RestaurantOutcome | null> {
    const tail = id.replace(/\D/g, '').slice(-10);
    const candidates: Array<{ id: string; phone?: string | null }> = id.includes('@')
      ? await this.prisma.user.findMany({
          where: { email: id, isActive: true, pinHash: { not: null } },
          select: { id: true },
          take: 10,
        })
      : tail.length >= 6
        ? await this.prisma.user.findMany({
            where: { isActive: true, pinHash: { not: null }, phone: { endsWith: tail.slice(-6) } },
            select: { id: true, phone: true },
            take: 10,
          })
        : [];
    for (const c of candidates) {
      if (c.phone !== undefined && (c.phone ?? '').replace(/\D/g, '').slice(-10) !== tail) continue;
      try {
        const { token, user } = await this.auth.pinLogin({ userId: c.id, pin });
        return { kind: 'ok', token, user };
      } catch {
        // wrong PIN / PIN login off for this account: try the next candidate
      }
    }
    // Spend the time of one compare when nothing was tried, so timing stays flat.
    await bcrypt.compare(pin, DUMMY_BCRYPT_HASH);
    return null;
  }

  private async auditRestaurantLogin(userId: string, ip?: string) {
    await this.audit
      .record({
        userId,
        action: 'LOGIN',
        entity: 'User',
        entityId: userId,
        metadata: { via: 'unified-login', ip: ip ?? null },
      })
      .catch(() => undefined);
  }

  // --- in-memory lockout (unified-login only) --------------------------------

  private isLocked(key: string): boolean {
    const f = this.failures.get(key);
    if (!f) return false;
    if (f.lockedUntil && f.lockedUntil > Date.now()) return true;
    if (f.lockedUntil) this.failures.delete(key); // window over
    return false;
  }

  /** Returns true when this failure triggered the lockout. */
  private recordFailure(key: string): boolean {
    if (this.failures.size >= MAX_TRACKED_IDENTIFIERS) this.purgeExpired();
    const f = this.failures.get(key) ?? { count: 0, lockedUntil: 0 };
    f.count += 1;
    let justLocked = false;
    if (f.count >= MAX_FAILED_ATTEMPTS) {
      f.lockedUntil = Date.now() + LOCKOUT_MS;
      f.count = 0;
      justLocked = true;
    }
    this.failures.set(key, f);
    return justLocked;
  }

  private purgeExpired() {
    const now = Date.now();
    for (const [k, v] of this.failures) {
      if (v.lockedUntil <= now) this.failures.delete(k);
    }
    // Still full of live entries: drop the oldest so memory stays bounded.
    while (this.failures.size >= MAX_TRACKED_IDENTIFIERS) {
      const first = this.failures.keys().next().value;
      if (first === undefined) break;
      this.failures.delete(first);
    }
  }

  private mask(id: string): string {
    const at = id.indexOf('@');
    if (at > 0) return `${id[0]}***${id.slice(at)}`;
    return `***${id.slice(-3)}`;
  }
}
