import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config.ts";

// The old platform sign-in URLs must land on the single /login page.
test("/platform/login and /platform/login/2fa redirect to /login", async () => {
  const redirects = await nextConfig.redirects?.();
  assert.ok(redirects, "next.config must define redirects()");
  for (const source of ["/platform/login", "/platform/login/2fa"]) {
    const rule: { source: string; destination: string } | undefined = redirects.find((r) => r.source === source);
    assert.ok(rule, `missing redirect for ${source}`);
    assert.equal(rule?.destination, "/login");
  }
});

test("the redirect is temporary, so a future split of the pages is not cached by browsers", async () => {
  const redirects = (await nextConfig.redirects?.()) ?? [];
  const rule = redirects.find((r) => r.source === "/platform/login");
  assert.equal(rule?.permanent, false);
});
