/**
 * SP-CONTACT-SCOUT-001 — cheap email transport for OTP / SAFE notifies.
 * Uses Resend HTTP API when configured. No SMTP passwords in git.
 * Never log message bodies that may contain OTP codes.
 */

export type EmailSendResult =
  | { ok: true; provider: 'resend' }
  | { ok: false; reason: 'not_configured' | 'invalid' | 'provider_error' };

export function isEmailTransportConfigured(): boolean {
  const apiKey = (process.env.SMARTPROTO_RESEND_API_KEY || process.env.RESEND_API_KEY || '').trim();
  return Boolean(apiKey);
}

function notifyFrom(): string {
  return (
    (process.env.SMARTPROTO_NOTIFY_FROM || '').trim() ||
    'SmartProto Editorial <onboarding@resend.dev>'
  );
}

/**
 * Send a plain-text email via Resend.
 * Returns not_configured when keys are missing — callers must not pretend delivery worked.
 */
export async function sendPlainEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<EmailSendResult> {
  const apiKey = (process.env.SMARTPROTO_RESEND_API_KEY || process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return { ok: false, reason: 'not_configured' };

  const to = (opts.to || '').trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 120) {
    return { ok: false, reason: 'invalid' };
  }
  const subject = String(opts.subject || '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 200);
  const text = String(opts.text || '').slice(0, 4000);
  if (!subject || !text) return { ok: false, reason: 'invalid' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: notifyFrom(),
        to: [to],
        subject,
        text,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { ok: false, reason: 'provider_error' };
    return { ok: true, provider: 'resend' };
  } catch {
    return { ok: false, reason: 'provider_error' };
  }
}
