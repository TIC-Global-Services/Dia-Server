export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface EmailLayout {
  /** Hidden preview line shown beside the subject in the inbox. */
  preview?: string;
  heading: string;
  /** Paragraphs, already plain text (escaped here). */
  paragraphs: string[];
  /** Label/value rows, e.g. order lines and totals. */
  rows?: { label: string; value: string; strong?: boolean }[];
  button?: { label: string; url: string };
  /** Small print under the button. */
  note?: string;
}

const BRAND = 'Dia Diamonds';
const INK = '#171717';
const MUTED = '#6b6b6b';
const LINE = '#e8e4e0';
const ACCENT = '#431A1A';

/** One look for every email: brand header, card, optional button, quiet footer. Inline styles only, for mail clients. */
export function renderEmail(o: EmailLayout): { html: string; text: string } {
  const e = escapeHtml;
  const rows = (o.rows ?? [])
    .map(
      (r) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${r.strong ? INK : MUTED};${r.strong ? 'font-weight:600;' : ''}">${e(r.label)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};${r.strong ? 'font-weight:600;' : ''}">${e(r.value)}</td></tr>`,
    )
    .join('');
  const button = o.button
    ? `<p style="margin:28px 0 8px"><a href="${e(o.button.url)}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;font-size:12px;letter-spacing:2px;font-weight:600;padding:15px 30px;border-radius:25px">${e(o.button.label.toUpperCase())}</a></p><p style="margin:12px 0 0;font-size:12px;color:${MUTED};word-break:break-all">Button not working? Copy this link into your browser:<br><a href="${e(o.button.url)}" style="color:${ACCENT}">${e(o.button.url)}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f4f2">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${e(o.preview ?? o.heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4f2;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="center" style="padding:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:4px;color:${INK}">${e(BRAND.toUpperCase())}</td></tr>
<tr><td style="background:#ffffff;border-radius:16px;padding:36px 32px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};line-height:1.55">
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;line-height:1.25">${e(o.heading)}</h1>
${o.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;color:#333">${e(p)}</p>`).join('')}
${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px">${rows}</table>` : ''}
${button}
${o.note ? `<p style="margin:22px 0 0;font-size:13px;color:${MUTED}">${e(o.note)}</p>` : ''}
</td></tr>
<tr><td align="center" style="padding:20px 12px 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${MUTED}">${e(BRAND)} · This is an automated message, please do not reply.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    o.heading,
    '',
    ...o.paragraphs,
    ...(o.rows?.length ? ['', ...o.rows.map((r) => `${r.label}: ${r.value}`)] : []),
    ...(o.button ? ['', `${o.button.label}: ${o.button.url}`] : []),
    ...(o.note ? ['', o.note] : []),
    '',
    `${BRAND}`,
  ].join('\n');
  return { html, text };
}
