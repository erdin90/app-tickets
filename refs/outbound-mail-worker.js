// Cloudflare Worker to send transactional emails via MailChannels
// Usage:
// - Deploy as an HTTP Worker (not Email Worker)
// - Set allowed origins or a static shared secret to protect the endpoint
// - Configure FROM, REPLY_TO, and optional ALLOW_ORIGIN or AUTH_SECRET in Worker vars
// - Point SEND_EMAIL_WORKER_URL in Supabase to this worker's URL
//
// Expected request body (JSON): { to: string, subject: string, text?: string, html?: string }
// Response: 200 on success, 4xx/5xx on error

export default {
  async fetch(req, env) {
    try {
      if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

      // Basic auth with static secret header (recommended)
      const expected = env.AUTH_SECRET || '';
      const provided = req.headers.get('x-mail-secret') || '';
      if (expected && provided !== expected) return new Response('Unauthorized', { status: 401 });

      // Optional CORS allow
      const origin = req.headers.get('origin') || '';
      const allow = env.ALLOW_ORIGIN || '';

      const { to, subject, text = '', html = '' } = await req.json();
      if (!to || !subject) return new Response('missing to/subject', { status: 400 });

      // Compose MailChannels payload
      const from = parseFrom(env.FROM || 'Soporte <soporte@paqva.com>');
      const payload = {
        personalizations: [{ to: [{ email: to }] }],
        from,
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
        headers: env.REPLY_TO ? { 'Reply-To': env.REPLY_TO } : undefined,
      };

      const resp = await fetch('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const txt = await resp.text().catch(() => '');
      if (!resp.ok) return new Response(txt || 'mailchannels error', { status: resp.status });

      const headers = allow && origin === allow ? { 'access-control-allow-origin': allow } : {};
      return new Response('ok', { status: 200, headers });
    } catch (err) {
      return new Response('error: ' + (err?.message || 'unknown'), { status: 500 });
    }
  },
};

function parseFrom(raw) {
  if (raw.includes('<')) {
    const match = raw.match(/<([^>]+)>/);
    const email = match?.[1] || raw;
    const name = raw.split('<')[0]?.trim().replace(/["<>]/g, '') || undefined;
    return { email, name };
  }
  return { email: raw };
}
