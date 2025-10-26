// Cloudflare Email Worker for converting inbound emails to tickets
// - Receives emails addressed to info@paqva.com (via Email Routing) and POSTs to your Next.js intake endpoint
// - Configure in Cloudflare Dashboard: Email > Routes => Route for info@paqva.com to this Worker
// - Configure Worker variables: INTAKE_ENDPOINT, INTAKE_SECRET, DOMAIN_BUSINESS_MAP (optional)
// - Safe by design: logs errors but never throws to avoid bouncing emails

export default {
  async email(message, env, ctx) {
    try {
      const subject = (message.headers.get('subject') || '').toString();
      const from = (message.headers.get('from') || '').toString();
      const to = (message.headers.get('to') || '').toString();
      const messageId = (message.headers.get('message-id') || '').toString();
      const date = (message.headers.get('date') || '').toString();

      // Extract email + optional display name
      const m = from.match(/^(?:\"?([^"<]+)\"?\s*)?<([^>]+)>$/);
      const requester_email = (m?.[2] || from).trim().toLowerCase();
      const requester_name = (m?.[1] || '').trim() || null;

      // Prefer plain text body for ticket content
      let content = '';
      try {
        const text = await message.text();
        content = text?.slice(0, 20000) || '';
      } catch (_) {
        content = '';
      }

      // Optional mapping: domain -> business code (e.g., {"paqva.com":"PAQVA"})
      let business_key = null;
      try {
        const domain = (requester_email.split('@')[1] || '').toLowerCase();
        const map = JSON.parse(env.DOMAIN_BUSINESS_MAP || '{}');
        const key = Object.keys(map).find((k) => k.toLowerCase() === domain);
        business_key = key ? map[key] : null;
      } catch (_) {}

      const payload = {
        title: subject || '(sin asunto)',
        content,
        requester_email,
        requester_name,
        business_key,
        received_at: date ? new Date(date).toISOString() : new Date().toISOString(),
        source: 'email',
        message_id: messageId || null,
        to,
      };

      const endpoint = env.INTAKE_ENDPOINT;
      if (!endpoint) {
        console.error('Missing INTAKE_ENDPOINT');
        return;
      }

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Intake-Secret': env.INTAKE_SECRET || '',
        },
        body: JSON.stringify(payload),
        redirect: 'manual', // evita seguir redirecciones y ayuda a detectar loops
      });

      // Detectar redirecciones explícitas
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get('location');
        console.error('Intake redirect', resp.status, loc);
        return;
      }

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        console.error('Intake failed', resp.status, txt);
      } else {
        console.log('Intake ok', requester_email, messageId);
      }
    } catch (err) {
      console.error('Email worker error', err);
      // swallow to avoid bounces
    }
  },
};
