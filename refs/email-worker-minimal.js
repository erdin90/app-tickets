// Cloudflare Email Worker (minimal) that forwards the raw MIME to Supabase
// Use this when the dashboard Quick Edit fails to import postal-mime.
// Vars required:
// - INBOUND_FN_URL: https://<PROJECT-REF>.functions.supabase.co/inbound-email
// - INTAKE_SECRET: same value as INBOUND_SECRET in Supabase function

export default {
  async email(message, env, ctx) {
    try {
      const raw = new Uint8Array(await message.raw.arrayBuffer());
      let rawBase64 = "";
      // Convert Uint8Array to base64 in chunks to avoid stack overflow
      const chunk = 0x8000;
      for (let i = 0; i < raw.length; i += chunk) {
        const sub = raw.subarray(i, i + chunk);
        rawBase64 += btoa(String.fromCharCode(...sub));
      }

      const payload = {
        from: (message.headers.get('from') || '').toString(),
        to: (message.headers.get('to') || '').toString(),
        subject: (message.headers.get('subject') || '').toString(),
        rawBase64,
      };

      const resp = await fetch(env.INBOUND_FN_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-intake-secret': env.INTAKE_SECRET,
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        console.error('Inbound error', resp.status, txt);
        return message.setReject(`Inbound error ${resp.status}`);
      }
    } catch (err) {
      console.error('Email worker error', err);
      return message.setReject('Inbound processing error');
    }
  },
};
