/**
 * Sends email over SMTP (nodemailer). Works with any provider that offers SMTP: Gmail app passwords,
 * Brevo, Mailgun, Resend's SMTP, a company mail server, and so on.
 *
 * Settings (.env.local): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, APP_URL. See .env.example.
 *
 * Development only: if SMTP isn't configured, the email is printed in the terminal instead of being sent,
 * so you can copy the link without any mail service. In production that fallback is OFF: a missing
 * setting is an error, so a link is never silently dropped or leaked to the logs.
 */
import { logError } from "./logger";
import nodemailer, { type Transporter } from "nodemailer";

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.MAIL_FROM;
const isProduction = process.env.NODE_ENV === "production";

export const isMailConfigured = Boolean(host && from);

export class MailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailError";
  }
}

export type Mail = { to: string; subject: string; text: string; html: string };

/**
 * The public address of this app, used to build links in emails. It comes from APP_URL on purpose and NOT from the
 * request's Host header: a forged Host header could otherwise make us email people a link to someone else's site.
 */
export function appUrl(): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (isProduction) throw new MailError("APP_URL is not set. Set it to your site's public address in .env.local.");
  return "http://localhost:3000";
}

declare global {
  var __dotkeepMailer: Transporter | undefined;
}

function transporter(): Transporter {
  globalThis.__dotkeepMailer ??= nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 is TLS from the start; other ports upgrade with STARTTLS when the server offers it
    auth: user ? { user, pass } : undefined,
    // Fail in seconds instead of hanging the request that is waiting on the email.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return globalThis.__dotkeepMailer;
}

/** Throws MailError if the email could not be sent (or can't be, because mail isn't configured in production). */
export async function sendMail(mail: Mail): Promise<void> {
  if (!isMailConfigured) {
    if (isProduction) throw new MailError("Email isn't configured. Set SMTP_HOST and MAIL_FROM in .env.local.");
    console.log(`\n[mail: development, not sent] To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
    return;
  }

  try {
    await transporter().sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
  } catch (error) {
    // Keep the provider's message in the server log only. Callers show a generic message.
    await logError(error, "mail: could not send");
    throw new MailError("The email could not be sent.");
  }
}
