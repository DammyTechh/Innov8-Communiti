import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { Errors } from '../errors.js';
import { logger } from '../logger.js';
import { renderLayout, renderText } from './layout.js';
import type { Template } from './templates.js';

export { templates, type Template } from './templates.js';

let transporter: Transporter | undefined;

/**
 * Resend SMTP relay: smtp.resend.com, user "resend", password = Resend API key.
 * Port 465 uses implicit TLS; 587 uses STARTTLS.
 */
function getTransport() {
  if (!env.mailEnabled) return undefined;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE, // true for 465, false for 587 (STARTTLS)
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    pool: false, // serverless: one connection per invocation
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter;
}

/**
 * Sends an email. Awaited by callers on purpose: on Vercel, work left running
 * after the response is sent can be frozen before it completes.
 * Without SMTP configured (local dev), the email is logged instead.
 */
export async function sendMail(to: string, template: Template) {
  const transport = getTransport();
  // Testing mode: route everything to one inbox, keeping the real recipient visible in the subject.
  const redirect = env.MAIL_REDIRECT_TO;
  const deliverTo = redirect || to;
  const subject = redirect && redirect.toLowerCase() !== to.toLowerCase() ? `[to ${to}] ${template.subject}` : template.subject;
  if (!transport) {
    logger.warn({ to, subject: template.subject, code: env.isProd ? undefined : template.content.code }, '[mailer] Resend SMTP not configured (SMTP_PASS empty), email logged instead');
    return;
  }
  try {
    await transport.sendMail({
      from: env.MAIL_FROM,
      to: deliverTo,
      replyTo: env.MAIL_REPLY_TO || undefined,
      subject,
      headers: template.tag ? { 'X-Entity-Ref-ID': `${template.tag}-${Date.now()}` } : undefined,
      html: renderLayout(template.content),
      text: renderText(template.content),
    });
  } catch (err) {
    logger.error({ err, to: deliverTo, subject }, '[mailer] failed to send');
    if (env.mailTestSender && !redirect) {
      logger.error('[mailer] onboarding@resend.dev only delivers to your Resend account email. Set MAIL_REDIRECT_TO to that address, or verify a domain.');
    }
    throw Errors.unavailable("We couldn't send the email right now. Please try again in a minute.");
  }
}

/** Checks the SMTP connection and credentials (used by `npm run mail:test`). */
export async function verifyMailer() {
  const transport = getTransport();
  if (!transport) throw new Error('SMTP_PASS (Resend API key) is not set');
  await transport.verify();
}

/** Fire-and-log variant for non-critical mail (welcome, notices). Still awaited. */
export async function sendMailSafe(to: string, template: Template) {
  try {
    await sendMail(to, template);
  } catch {
    /* logged above */
  }
}
