import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PlatformRawDb } from './platform-raw-db.service';
import {
  generateSecret,
  verifyTotp,
  sealSecret,
  openSecret,
  generateRecoveryCode,
  otpauthUrl,
} from '../../auth/totp';

const RECOVERY_CODE_COUNT = 8;
const MAX_MFA_FAILURES = 5;

@Injectable()
export class PlatformTwoFactorService {
  private readonly mfaFailures = new Map<string, number>();

  constructor(
    private readonly rawDb: PlatformRawDb,
    private readonly config: ConfigService,
  ) {}

  private get keyMaterial(): string {
    return this.config.getOrThrow<string>('PLATFORM_JWT_SECRET');
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(`recovery:${code}`).digest('hex');
  }

  async setup(userId: string) {
    const secret = generateSecret();
    const user = await this.rawDb.findUserById(userId, 'email') as { email: string };
    const url = otpauthUrl(secret, user.email, 'Maxora Platform');
    const sealed = sealSecret(secret, this.keyMaterial);
    await this.rawDb.updateUser(userId, { twoFactorSecret: sealed, twoFactorEnabled: false });
    return { secret, url };
  }

  async enable(userId: string, code: string) {
    const user = await this.rawDb.findUserById(
      userId,
      `"twoFactorSecret", "twoFactorEnabled", "twoFactorLastStep"`,
    ) as { twoFactorSecret: string | null; twoFactorEnabled: boolean; twoFactorLastStep: number | null };

    if (!user.twoFactorSecret) {
      throw new BadRequestException('2FA setup not initiated');
    }
    const secret = openSecret(user.twoFactorSecret, this.keyMaterial);
    const step = verifyTotp(secret, code);
    if (step === null || (user.twoFactorLastStep !== null && step <= (user.twoFactorLastStep ?? -1))) {
      throw new BadRequestException('Invalid or already-used TOTP code');
    }
    const plainCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      generateRecoveryCode(),
    );
    const hashed = plainCodes.map((c) => this.hashCode(c));
    await this.rawDb.updateUser(userId, {
      twoFactorEnabled: true,
      twoFactorLastStep: step,
      recoveryCodes: hashed,
    });
    return { recoveryCodes: plainCodes };
  }

  async verifyLogin(
    userId: string,
    secret: string,
    code: string,
    lastStep: number | null,
  ): Promise<void> {
    const failures = this.mfaFailures.get(userId) ?? 0;
    if (failures >= MAX_MFA_FAILURES) {
      throw new BadRequestException('Too many MFA failures. Try logging in again.');
    }
    const step = verifyTotp(secret, code);
    if (step === null || (lastStep !== null && step <= lastStep)) {
      this.mfaFailures.set(userId, failures + 1);
      throw new BadRequestException('Invalid or already-used TOTP code');
    }
    this.mfaFailures.delete(userId);
    await this.rawDb.updateUser(userId, { twoFactorLastStep: step });
  }

  async consumeRecoveryCode(
    userId: string,
    recoveryCodes: string[],
    code: string,
  ): Promise<void> {
    const normalized = code.trim().toUpperCase();
    const hash = this.hashCode(normalized);
    const idx = recoveryCodes.indexOf(hash);
    if (idx === -1) {
      throw new BadRequestException('Invalid recovery code');
    }
    const updated = [...recoveryCodes];
    updated.splice(idx, 1);
    await this.rawDb.updateUser(userId, { recoveryCodes: updated });
  }

  openSecret(sealed: string): string {
    return openSecret(sealed, this.keyMaterial);
  }
}
