// SERVER ONLY. Sends email with Resend (resend.com) using plain fetch, so no extra package is needed.
// Needs two settings in Vercel: RESEND_API_KEY and EMAIL_FROM (for example: TrendyToyz <orders@trendytoyz.in>).
// Without them nothing is sent and nothing breaks.
export const emailEnabled = () => !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;

export async function sendEmail({ to, subject, html }) {
  if (!emailEnabled()) return { ok: false, skipped: true };
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return { ok: false, skipped: true };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM.trim(), to: [to], subject, html }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) { console.error('email failed', r.status, (await r.text().catch(() => '')).slice(0, 200)); return { ok: false }; }
    return { ok: true };
  } catch (e) {
    console.error('email failed', e.message);
    return { ok: false };
  }
}
