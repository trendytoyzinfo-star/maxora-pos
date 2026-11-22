import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { PlatformSessionUser } from '@maxora/types';

const MFA_MANDATORY_ROLES = new Set(['SUPER_ADMIN', 'PLATFORM_ADMIN']);

/**
 * Requires that SUPER_ADMIN and PLATFORM_ADMIN have 2FA enabled.
 * Place after PlatformAuthGuard on routes that need full MFA compliance.
 */
@Injectable()
export class PlatformMfaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: PlatformSessionUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Not authenticated');
    if (MFA_MANDATORY_ROLES.has(user.role) && !user.twoFactorEnabled) {
      throw new ForbiddenException({
        message: 'Two-factor authentication is required for this role',
        code: 'MFA_SETUP_REQUIRED',
      });
    }
    return true;
  }
}
