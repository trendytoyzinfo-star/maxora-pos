import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { AuthModule } from '../../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { UnifiedAuthController } from './unified-auth.controller';
import { UnifiedAuthService } from './unified-auth.service';

@Module({
  imports: [AuthModule, PlatformModule, AuditModule],
  controllers: [UnifiedAuthController],
  providers: [UnifiedAuthService],
})
export class UnifiedAuthModule {}
