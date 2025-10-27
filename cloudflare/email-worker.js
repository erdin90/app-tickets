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

      // Basic trace to confirm the Worker is being invoked by Email Routing
      try { console.log('worker: email received', { subject, from, to, messageId }); } catch (_) {}

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
      const fallback = env.FALLBACK_ENDPOINT || env.VERCEL_ENDPOINT; // opcional
      if (!endpoint) {
        console.error('Missing INTAKE_ENDPOINT');
        return;
      }

      // helper para postear con manejo de redirects y logging
      const postIntake = async (url) => {
        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Intake-Secret': env.INTAKE_SECRET || '',
            },
            body: JSON.stringify(payload),
            redirect: 'manual',
          });

          if (resp.status >= 300 && resp.status < 400) {
            const loc = resp.headers.get('location');
            console.error('Intake redirect', resp.status, loc);
            return { ok: false, status: resp.status, redirectedTo: loc };
          }
          if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            console.error('Intake failed', resp.status, txt);
            return { ok: false, status: resp.status, body: txt };
          }
          console.log('Intake ok', requester_email, messageId, resp.status);
          return { ok: true, status: resp.status };
        } catch (err) {
          console.error('Intake error', url, err?.message || String(err));
          return { ok: false, error: err };
        }
      };

      // 1er intento al dominio principal (it.paqva.com)
      let result = await postIntake(endpoint);

      // Si falló por redirect o error y tenemos fallback, reintenta directo al dominio de Vercel
      if (!result.ok && fallback) {
        console.warn('Retrying intake via FALLBACK_ENDPOINT');
        await postIntake(fallback);
      }
    } catch (err) {
      console.error('Email worker error', err);
      // swallow to avoid bounces
    }
  },
};
