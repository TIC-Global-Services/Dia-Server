export interface ResendTemplateMail {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  /** Id (or alias) of a published template in the Resend dashboard. */
  templateId: string;
  /** Keys: letters, digits and underscores only. Values: text up to 2000 characters, or numbers. */
  variables: Record<string, string | number>;
}

/** Sends a template stored in the Resend dashboard. Resend rejects html/text alongside a template, so this bypasses the HTML transport. */
export async function sendResendTemplate(m: ResendTemplateMail): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${m.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: m.from,
      to: [m.to],
      subject: m.subject,
      template: { id: m.templateId, variables: m.variables },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Resend template send failed (${res.status}): ${detail}`);
  }
}
