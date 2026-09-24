import { env } from '../../config/env.js';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface LayoutInput {
  preheader: string;
  heading: string;
  paragraphs: string[];
  code?: string;
  button?: { label: string; url: string };
  footnote?: string;
}

/** Table-based, inline-styled layout that renders in Gmail, Outlook and Apple Mail. Brand tokens from Figma. */
export function renderLayout(i: LayoutInput) {
  const paragraphs = i.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#374151;">${esc(p)}</p>`)
    .join('');
  const code = i.code
    ? `<div style="margin:8px 0 24px;padding:16px 0;border-radius:8px;background:#FFF1E5;text-align:center;font-size:32px;letter-spacing:10px;font-weight:700;color:#ED8322;">${esc(i.code)}</div>`
    : '';
  const button = i.button
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px;"><tr><td style="border-radius:8px;background:#39B04C;">
         <a href="${esc(i.button.url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">${esc(i.button.label)}</a>
       </td></tr></table>`
    : '';
  const footnote = i.footnote ? `<p style="margin:0;font-size:13px;line-height:20px;color:#6B7280;">${esc(i.footnote)}</p>` : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(i.heading)}</title></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;">${esc(i.preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8F9FA;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
      <tr><td style="padding:0 0 20px;font-size:22px;font-weight:700;color:#ED8322;">${esc(env.APP_NAME)}</td></tr>
      <tr><td style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:14px;padding:32px;">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:#000000;font-weight:700;">${esc(i.heading)}</h1>
        ${paragraphs}${code}${button}${footnote}
      </td></tr>
      <tr><td style="padding:20px 4px 0;font-size:12px;line-height:18px;color:#9CA3AF;">
        You received this email because an account on ${esc(env.APP_NAME)} uses this address.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function renderText(i: LayoutInput) {
  return [i.heading, '', ...i.paragraphs, i.code ? `\nCode: ${i.code}\n` : '', i.button ? `${i.button.label}: ${i.button.url}` : '', i.footnote ?? '']
    .filter((l) => l !== undefined)
    .join('\n');
}
