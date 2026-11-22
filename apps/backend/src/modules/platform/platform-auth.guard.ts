import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Guards platform routes with the platform-jwt Passport strategy. */
@Injectable()
export class PlatformAuthGuard extends AuthGuard('platform-jwt') {
  override canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
