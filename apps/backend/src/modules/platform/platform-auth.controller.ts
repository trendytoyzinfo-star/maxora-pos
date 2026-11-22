import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Req,
  Res,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PlatformMfaGuard } from './platform-mfa.guard';
import {
  PLATFORM_ACCESS_COOKIE,
  PLATFORM_REFRESH_COOKIE,
  PLATFORM_ACCESS_MAX_AGE,
  PLATFORM_REFRESH_MAX_AGE,
  platformCookieOpts,
} from './platform-cookies';
import type {
  PlatformLoginDto,
  PlatformTotpDto,
  PlatformRecoveryDto,
  PlatformTotpSetupConfirmDto,
  PlatformSessionUser,
} from '@maxora/types';

const ACCESS_COOKIE = PLATFORM_ACCESS_COOKIE;
const REFRESH_COOKIE = PLATFORM_REFRESH_COOKIE;
const ACCESS_MAX_AGE = PLATFORM_ACCESS_MAX_AGE;
const REFRESH_MAX_AGE = PLATFORM_REFRESH_MAX_AGE;
const cookieOpts = platformCookieOpts;

function getIp(req: Request): string | undefined {
  return (req.ip ?? (req.socket?.remoteAddress)) || undefined;
}

@Controller('platform')
export class PlatformAuthController {
  constructor(private readonly auth: PlatformAuthService) {}

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: PlatformLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, getIp(req), req.headers['user-agent']);

    if (result.type === 'mfa_required') {
      return { mfaRequired: true, mfaToken: result.mfaToken };
    }

    res.cookie(ACCESS_COOKIE, result.accessToken, cookieOpts(ACCESS_MAX_AGE));
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOpts(REFRESH_MAX_AGE, '/api/platform/auth/refresh'));
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // 2FA verify (after login MFA token)
  // -------------------------------------------------------------------------

  @Post('auth/2fa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyTotp(
    @Body() dto: PlatformTotpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyTotp(dto, getIp(req), req.headers['user-agent']);
    res.cookie(ACCESS_COOKIE, result.accessToken, cookieOpts(ACCESS_MAX_AGE));
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOpts(REFRESH_MAX_AGE, '/api/platform/auth/refresh'));
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Recovery code (after login MFA token)
  // -------------------------------------------------------------------------

  @Post('auth/2fa/recovery')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async verifyRecovery(
    @Body() dto: PlatformRecoveryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyRecovery(dto, getIp(req), req.headers['user-agent']);
    res.cookie(ACCESS_COOKIE, result.accessToken, cookieOpts(ACCESS_MAX_AGE));
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOpts(REFRESH_MAX_AGE, '/api/platform/auth/refresh'));
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // 2FA setup (authenticated, MFA guard skipped intentionally so setup can proceed)
  // -------------------------------------------------------------------------

  @Post('auth/2fa/setup')
  @UseGuards(PlatformAuthGuard)
  @HttpCode(HttpStatus.OK)
  async setup2fa(@Req() req: Request & { user: PlatformSessionUser }) {
    return this.auth.setup2fa(req.user.id);
  }

  @Post('auth/2fa/confirm')
  @UseGuards(PlatformAuthGuard)
  @HttpCode(HttpStatus.OK)
  async confirm2fa(
    @Body() dto: PlatformTotpSetupConfirmDto,
    @Req() req: Request & { user: PlatformSessionUser },
  ) {
    return this.auth.confirm2fa(req.user.id, dto.code);
  }

  // -------------------------------------------------------------------------
  // Refresh token
  // -------------------------------------------------------------------------

  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req.cookies as Record<string, string>)[REFRESH_COOKIE];
    if (!refreshToken) {
      res.status(HttpStatus.UNAUTHORIZED).json({ message: 'No refresh token' });
      return;
    }
    const result = await this.auth.refresh(refreshToken, getIp(req), req.headers['user-agent']);
    res.cookie(ACCESS_COOKIE, result.accessToken, cookieOpts(ACCESS_MAX_AGE));
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOpts(REFRESH_MAX_AGE, '/api/platform/auth/refresh'));
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------------

  @Post('auth/logout')
  @UseGuards(PlatformAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request & { user: PlatformSessionUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    // Extract sessionId from cookie JWT (already validated by guard)
    const token = (req.cookies as Record<string, string>)[ACCESS_COOKIE];
    // Parse payload without full verification (already done by guard)
    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as { sid?: string };
    const sessionId = payload.sid ?? '';
    await this.auth.logout(sessionId, req.user.id, getIp(req));
    res.clearCookie(ACCESS_COOKIE);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/platform/auth/refresh' });
    return { ok: true };
  }

  @Post('auth/logout-all')
  @UseGuards(PlatformAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @Req() req: Request & { user: PlatformSessionUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logoutAll(req.user.id, getIp(req));
    res.clearCookie(ACCESS_COOKIE);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/platform/auth/refresh' });
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // /me
  // -------------------------------------------------------------------------

  @Get('me')
  @UseGuards(PlatformAuthGuard, PlatformMfaGuard)
  async getMe(@Req() req: Request & { user: PlatformSessionUser }) {
    return this.auth.getMe(req.user.id);
  }

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  @Get('security/sessions')
  @UseGuards(PlatformAuthGuard, PlatformMfaGuard)
  async getSessions(@Req() req: Request & { user: PlatformSessionUser }) {
    return this.auth.getSessions(req.user.id);
  }

  @Delete('security/sessions/:id')
  @UseGuards(PlatformAuthGuard, PlatformMfaGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Param('id') id: string,
    @Req() req: Request & { user: PlatformSessionUser },
  ) {
    await this.auth.revokeSession(req.user.id, id, getIp(req));
  }
}
