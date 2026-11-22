import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { unifiedLoginSchema, type UnifiedLoginDto } from '@maxora/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  PLATFORM_ACCESS_COOKIE,
  PLATFORM_ACCESS_MAX_AGE,
  PLATFORM_REFRESH_COOKIE,
  PLATFORM_REFRESH_MAX_AGE,
  PLATFORM_REFRESH_PATH,
  platformCookieOpts,
} from '../platform/platform-cookies';
import { UnifiedAuthService } from './unified-auth.service';

// Restaurant session cookie — same name/options AuthController uses, so the
// existing JwtStrategy reads it unchanged.
const RESTAURANT_COOKIE = 'maxora_session';
const RESTAURANT_MAX_AGE = 12 * 60 * 60 * 1000;

@ApiTags('auth')
@Controller('auth')
export class UnifiedAuthController {
  constructor(private readonly unified: UnifiedAuthService) {}

  // Credential-stuffing target: tighter than the app-wide default.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('unified-login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(unifiedLoginSchema))
  async login(
    @Body() body: UnifiedLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.unified.login(body, req.ip || undefined, req.headers['user-agent']);

    if (out.accountType === 'restaurant') {
      // One /login session is one account type: drop any platform cookies.
      res.clearCookie(PLATFORM_ACCESS_COOKIE, { path: '/' });
      res.clearCookie(PLATFORM_REFRESH_COOKIE, { path: PLATFORM_REFRESH_PATH });
      res.cookie(RESTAURANT_COOKIE, out.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.COOKIE_SECURE === 'true',
        maxAge: RESTAURANT_MAX_AGE,
      });
      return { accountType: 'restaurant' as const, user: out.user };
    }

    if (out.result.type === 'mfa_required') {
      return {
        accountType: 'platform' as const,
        mfaRequired: true,
        mfaToken: out.result.mfaToken,
      };
    }

    res.clearCookie(RESTAURANT_COOKIE, { path: '/' });
    res.cookie(
      PLATFORM_ACCESS_COOKIE,
      out.result.accessToken,
      platformCookieOpts(PLATFORM_ACCESS_MAX_AGE),
    );
    res.cookie(
      PLATFORM_REFRESH_COOKIE,
      out.result.refreshToken,
      platformCookieOpts(PLATFORM_REFRESH_MAX_AGE, PLATFORM_REFRESH_PATH),
    );
    return { accountType: 'platform' as const, ok: true as const };
  }
}
