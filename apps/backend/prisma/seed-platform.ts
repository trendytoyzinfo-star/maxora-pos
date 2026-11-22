/**
 * Platform super-admin seed.
 * Run: pnpm seed:platform  (from apps/backend/)
 *
 * Reads credentials from env:
 *   PLATFORM_SEED_EMAIL     — required
 *   PLATFORM_SEED_PASSWORD  — required
 *
 * Idempotent: skips if the user already exists.
 * Uses raw SQL because prisma generate hasn't been re-run yet for platform tables.
 * Does NOT touch any existing restaurant data or existing seed.ts.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.PLATFORM_SEED_EMAIL;
  const password = process.env.PLATFORM_SEED_PASSWORD;

  if (!email || !password) {
    console.error(
      'ERROR: PLATFORM_SEED_EMAIL and PLATFORM_SEED_PASSWORD must be set in .env',
    );
    process.exit(1);
  }

  // Check existing using raw SQL (platform tables not in generated Prisma client yet)
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM platform_users WHERE email = $1 LIMIT 1`,
    email,
  );

  if (rows.length > 0) {
    console.log(`Platform SUPER_ADMIN already exists (${email}). Skipping.`);
    return;
  }

  const passwordHash = await argon2.hash(password);

  await prisma.$executeRawUnsafe(
    `INSERT INTO platform_users (id, name, email, "passwordHash", role, status, "twoFactorEnabled", "failedAttempts", "createdAt")
     VALUES (gen_random_uuid(), $1, $2, $3, 'SUPER_ADMIN', 'ACTIVE', false, 0, NOW())`,
    'Super Admin',
    email,
    passwordHash,
  );

  console.log(`✅ Platform SUPER_ADMIN created: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
