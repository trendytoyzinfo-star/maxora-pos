/** Platform (Super Admin) cookie names/options — shared by the platform and unified-login controllers. */
export const PLATFORM_ACCESS_COOKIE = 'maxora_platform_session';
export const PLATFORM_REFRESH_COOKIE = 'maxora_platform_refresh';
export const PLATFORM_REFRESH_PATH = '/api/platform/auth/refresh';
export const PLATFORM_ACCESS_MAX_AGE = 15 * 60 * 1000;
export const PLATFORM_REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function platformCookieOpts(maxAge: number, path = '/') {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.COOKIE_SECURE === 'true',
    path,
    maxAge,
  };
}
