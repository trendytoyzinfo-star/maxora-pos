import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PlatformRawDb } from './platform-raw-db.service';
import type { PlatformSessionUser } from '@maxora/types';

export interface PlatformJwtPayload {
  sub: string; // userId
  sid: string; // sessionId
  role: string;
  iss: string; // 'maxora-platform'
  ms: number; // issued ms
}

const PLATFORM_ISS = 'maxora-platform';
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const cookieExtractor = (req: { cookies?: Record<string, string> }): string | null =>
  req.cookies?.['maxora_platform_session'] ?? null;

@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(Strategy, 'platform-jwt') {
  constructor(
    config: ConfigService,
    private readonly rawDb: PlatformRawDb,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('PLATFORM_JWT_SECRET'),
      passReqToCallback: false,
    });
  }

  async validate(payload: PlatformJwtPayload): Promise<PlatformSessionUser> {
    // Reject non-platform tokens
    if (payload.iss !== PLATFORM_ISS) {
      throw new UnauthorizedException('Invalid token issuer');
    }

    // Get session with user data via raw SQL
    const rows = await this.rawDb.prisma.$queryRawUnsafe<Array<{
      id: string; userId: string; revokedAt: Date | null; expiresAt: Date; lastSeenAt: Date;
      userName: string; userEmail: string; userRole: string; userStatus: string;
      userTwoFactorEnabled: boolean; userLastLoginAt: Date | null; userCreatedAt: Date;
    }>>(
      `SELECT s.id, s."userId", s."revokedAt", s."expiresAt", s."lastSeenAt",
              u.name AS "userName", u.email AS "userEmail", u.role AS "userRole",
              u.status AS "userStatus", u."twoFactorEnabled" AS "userTwoFactorEnabled",
              u."lastLoginAt" AS "userLastLoginAt", u."createdAt" AS "userCreatedAt"
       FROM platform_sessions s
       JOIN platform_users u ON u.id = s."userId"
       WHERE s.id = $1 LIMIT 1`,
      payload.sid,
    );

    const session = rows[0];

    if (!session || session.revokedAt) {
      throw new UnauthorizedException('Session no longer valid');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    // Idle timeout: if lastSeenAt is older than 30 min
    const idleSince = Date.now() - new Date(session.lastSeenAt).getTime();
    if (idleSince > IDLE_TIMEOUT_MS) {
      throw new UnauthorizedException('Session expired due to inactivity');
    }

    if (session.userStatus !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    // Update lastSeenAt (fire-and-forget)
    void this.rawDb.updateSession(payload.sid, { lastSeenAt: new Date() }).catch(() => void 0);

    return {
      id: session.userId,
      name: session.userName,
      email: session.userEmail,
      role: session.userRole as PlatformSessionUser['role'],
      twoFactorEnabled: session.userTwoFactorEnabled,
      lastLoginAt: session.userLastLoginAt ? new Date(session.userLastLoginAt).toISOString() : null,
      createdAt: new Date(session.userCreatedAt).toISOString(),
    };
  }
}
