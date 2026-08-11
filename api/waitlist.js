// Vercel serverless function: receives "Start gratis" waitlist signups (closed beta) and emails them.
// Required env vars on Vercel (shared with api/apply.js):
//   RESEND_API_KEY     — API key from resend.com
//   LEAD_NOTIFY_EMAIL  — comma-separated list of recipients
//   LEAD_FROM_EMAIL    — verified sender (e.g. "Punchlister <pilot@punchlister.com>")
// Optional:
//   LEAD_REPLY_TO      — defaults to applicant's email

const MAX_LEN = { firstName: 80, lastName: 80, email: 200, companyName: 120, phone: 30, message: 1000 };

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bad(res, code, message) {
  res.status(code).json({ error: message });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return bad(res, 405, 'Method not allowed');
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return bad(res, 400, 'Invalid JSON'); }
  }
  if (!body || typeof body !== 'object') return bad(res, 400, 'Invalid body');

  if (body.website) return res.status(200).json({ ok: true }); // honeypot: pretend success, drop silently

  const firstName   = String(body.firstName   || '').trim().slice(0, MAX_LEN.firstName);
  const lastName    = String(body.lastName    || '').trim().slice(0, MAX_LEN.lastName);
  const email       = String(body.email       || '').trim().slice(0, MAX_LEN.email);
  const companyName = String(body.companyName || '').trim().slice(0, MAX_LEN.companyName);
  const phone       = String(body.phone       || '').trim().slice(0, MAX_LEN.phone);
  const message      = String(body.message     || '').trim().slice(0, MAX_LEN.message);

  if (!firstName || !lastName || !email || !companyName) return bad(res, 400, 'Missing required fields');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, 400, 'Invalid email');

  const apiKey   = process.env.RESEND_API_KEY;
  const toList   = (process.env.LEAD_NOTIFY_EMAIL || '').split(',').map(s => s.trim()).filter(Boolean);
  const fromAddr = process.env.LEAD_FROM_EMAIL || 'Punchlister <onboarding@resend.dev>';
  const replyTo  = process.env.LEAD_REPLY_TO || email;

  if (!apiKey || toList.length === 0) {
    console.error('waitlist: missing RESEND_API_KEY or LEAD_NOTIFY_EMAIL');
    return bad(res, 500, 'Mail service not configured');
  }

  const name = `${firstName} ${lastName}`.trim();

  async function sendEmail(payload) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`resend ${resp.status}: ${errText}`);
    }
  }

  // 1. Internal notification — this is the actual lead capture, so a failure here fails the request.
  const notifySubject = `Wachtlijst-aanmelding — ${companyName} (${name})`;
  const notifyText =
`Nieuwe wachtlijst-aanmelding (Start gratis)

Bedrijf:   ${companyName}
Naam:      ${name}
E-mail:    ${email}
Telefoon:  ${phone || '—'}

Boodschap:
${message || '—'}

---
Verstuurd via punchlister.com "Start gratis".`;

  const notifyHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; color:#1a1240;">
      <h2 style="margin:0 0 16px;font-weight:500;">Nieuwe wachtlijst-aanmelding</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;color:#6b6280;width:120px;">Bedrijf</td><td style="padding:8px 0;"><strong>${escapeHtml(companyName)}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#6b6280;">Naam</td><td style="padding:8px 0;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b6280;">E-mail</td><td style="padding:8px 0;"><a href="mailto:${escapeHtml(email)}" style="color:#7c6df0;">${escapeHtml(email)}</a></td></tr>
        <tr><td style="padding:8px 0;color:#6b6280;">Telefoon</td><td style="padding:8px 0;">${phone ? escapeHtml(phone) : '—'}</td></tr>
      </table>
      ${message ? `<div style="margin-top:18px;padding-top:18px;border-top:1px solid #ebe6d9;"><div style="color:#6b6280;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Boodschap</div><div style="white-space:pre-wrap;font-size:14px;line-height:1.5;">${escapeHtml(message)}</div></div>` : ''}
      <p style="margin-top:24px;font-size:12px;color:#6b6280;">Verstuurd via punchlister.com "Start gratis" (gesloten bèta).</p>
    </div>`;

  try {
    await sendEmail({ from: fromAddr, to: toList, reply_to: replyTo, subject: notifySubject, text: notifyText, html: notifyHtml });
  } catch (err) {
    console.error('waitlist: internal notify failed', err);
    return bad(res, 502, 'Mail service error');
  }

  // 2. Confirmation to the applicant — best-effort. Its failure shouldn't fail the lead capture,
  // since the internal notification above already succeeded.
  try {
    const confirmSubject = 'Je staat op de wachtlijst — Punchlister';
    const confirmText =
`Hoi ${firstName},

Bedankt voor je aanmelding voor Punchlister namens ${companyName}.

Dit hebben we van je genoteerd:
Bedrijf:   ${companyName}
Naam:      ${name}
E-mail:    ${email}
Telefoon:  ${phone || '—'}
${message ? `Boodschap: ${message}\n` : ''}
We nemen meestal binnen één werkdag contact met je op om je bedrijf gratis klaar te zetten voor de gesloten bèta.

Klopt er iets niet, of wil je iets aanvullen? Antwoord gewoon op deze e-mail.

Tot binnenkort,
Het Punchlister-team`;

    const confirmHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; color:#1a1240;">
        <h2 style="margin:0 0 16px;font-weight:500;">Je staat op de wachtlijst</h2>
        <p style="font-size:14px;line-height:1.6;">Hoi ${escapeHtml(firstName)},</p>
        <p style="font-size:14px;line-height:1.6;">Bedankt voor je aanmelding voor Punchlister namens <strong>${escapeHtml(companyName)}</strong>.</p>
        <div style="margin:20px 0;padding:16px 18px;background:#f3eee3;border-radius:10px;">
          <div style="color:#6b6280;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Dit hebben we van je genoteerd</div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:4px 0;color:#6b6280;width:100px;">Bedrijf</td><td style="padding:4px 0;"><strong>${escapeHtml(companyName)}</strong></td></tr>
            <tr><td style="padding:4px 0;color:#6b6280;">Naam</td><td style="padding:4px 0;">${escapeHtml(name)}</td></tr>
            <tr><td style="padding:4px 0;color:#6b6280;">E-mail</td><td style="padding:4px 0;">${escapeHtml(email)}</td></tr>
            <tr><td style="padding:4px 0;color:#6b6280;">Telefoon</td><td style="padding:4px 0;">${phone ? escapeHtml(phone) : '—'}</td></tr>
          </table>
          ${message ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2dcc9;"><div style="color:#6b6280;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Boodschap</div><div style="white-space:pre-wrap;font-size:14px;line-height:1.5;">${escapeHtml(message)}</div></div>` : ''}
        </div>
        <p style="font-size:14px;line-height:1.6;">We nemen meestal binnen één werkdag contact met je op om je bedrijf gratis klaar te zetten voor de gesloten bèta.</p>
        <p style="font-size:14px;line-height:1.6;">Klopt er iets niet, of wil je iets aanvullen? Antwoord gewoon op deze e-mail.</p>
        <p style="font-size:14px;line-height:1.6;">Tot binnenkort,<br>Het Punchlister-team</p>
      </div>`;

    await sendEmail({
      from: fromAddr,
      to: [`${name} <${email}>`],
      reply_to: toList[0] || fromAddr,
      subject: confirmSubject,
      text: confirmText,
      html: confirmHtml
    });
  } catch (err) {
    console.error('waitlist: confirmation email failed', err);
  }

  return res.status(200).json({ ok: true });
};
