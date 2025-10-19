// Cloudflare Email Worker example
// - Uses Email Workers (experimental) with event.respondWith() or exported email() handler
// - Parses incoming email metadata
// - Posts a compact JSON to your Next.js intake API
// - IMPORTANT: Do not throw on failures to avoid bouncing the email
// - Configure environment variables in the Worker:
//   INTAKE_ENDPOINT: https://your-domain/api/intake/email
//   INTAKE_SECRET: <same as Vercel>
//   DOMAIN_BUSINESS_MAP: JSON string mapping domain->business code, e.g. {"glf.com":"GLF","paqva.com":"PAQ"}

export default {
  async email(message, env, ctx) {
    try {
      const subject = (message.headers.get('subject') || '').toString();
      const from = (message.headers.get('from') || '').toString();
      const messageId = (message.headers.get('message-id') || '').toString();
      const date = (message.headers.get('date') || '').toString();

      // Extract simple email address and name
      // e.g. "John Doe <john@glf.com>" => name: John Doe, email: john@glf.com
      const m = from.match(/^(?:\"?([^"<]+)\"?\s*)?<([^>]+)>$/);
      const requester_email = (m?.[2] || from).trim().toLowerCase();
      const requester_name = (m?.[1] || '').trim() || null;

      // Plain text body preferred for ticket description
      let content = '';
      try {
        const text = await message.text();
        content = text?.slice(0, 20000) || '';
      } catch (_) {
        content = '';
      }

      // Map domain to business code if configured
      let business_key = null;
      try {
        const domain = (requester_email.split('@')[1] || '').toLowerCase();
        const map = JSON.parse(env.DOMAIN_BUSINESS_MAP || '{}');
        const key = Object.keys(map).find(k => k.toLowerCase() === domain);
        business_key = key ? map[key] : null;
      } catch (_) {}

      // Compose payload
      const payload = {
        title: subject || '(sin asunto)',
        content,
        requester_email,
        requester_name,
        business_key,
        received_at: date ? new Date(date).toISOString() : new Date().toISOString(),
        source: 'email',
        message_id: messageId || null,
      };

      // Resolve endpoint (accept INTAKE_ENDPOINT or legacy INTAKE_URL)
      const endpoint = env.INTAKE_ENDPOINT || env.INTAKE_URL;
      // Send to intake API
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Intake-Secret': env.INTAKE_SECRET,
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        // Log and continue; don't bounce email
        const txt = await resp.text().catch(() => '');
        console.error('Intake failed', resp.status, txt);
      } else {
        // Optional: minimal success trace
        console.log('Intake ok', requester_email, messageId);
      }
    } catch (err) {
      console.error('Worker error', err);
      // Swallow errors to avoid generating bounces
    }
  },
};
