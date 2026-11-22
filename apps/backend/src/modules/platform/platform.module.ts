import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformTwoFactorService } from './platform-two-factor.service';
import { PlatformJwtStrategy } from './platform-jwt.strategy';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PlatformMfaGuard } from './platform-mfa.guard';
import { PlatformRolesGuard } from './platform-roles.guard';
import { PlatformRawDb } from './platform-raw-db.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('PLATFORM_JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [PlatformAuthController],
  providers: [
    PlatformRawDb,
    PlatformAuthService,
    PlatformAuditService,
    PlatformTwoFactorService,
    PlatformJwtStrategy,
    PlatformAuthGuard,
    PlatformMfaGuard,
    PlatformRolesGuard,
  ],
  exports: [PlatformAuthService, PlatformAuditService, PlatformRawDb],
})
export class PlatformModule {}
