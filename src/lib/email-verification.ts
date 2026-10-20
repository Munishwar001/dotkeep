import type { ObjectId } from "mongodb";
import { cancelVerifications, createVerification, VERIFICATION_HOURS } from "@/db/email-verifications";
import { appUrl, sendMail } from "./mail";

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export type SendResult = "sent" | "cooldown" | "failed";

/**
 * Makes a fresh verification link and emails it. Never throws:
 *  - "sent":     the email went out (or was printed in the terminal in development)
 *  - "cooldown": a link was sent less than a minute ago, so nothing new was sent
 *  - "failed":   the email could not be sent; the link is cancelled so the person can ask again straight away
 */
export async function sendVerificationEmail(user: { _id: ObjectId; name: string; email: string }): Promise<SendResult> {
  const created = await createVerification(user._id);
  if ("cooldown" in created) return "cooldown";

  try {
    const link = `${appUrl()}/verify-email?token=${encodeURIComponent(created.token)}`;
    const name = user.name.trim() || "there";
    const text = [
      `Hi ${name},`,
      "",
      "Confirm your email address to finish setting up your Dotkeep account:",
      "",
      link,
      "",
      `This link works once and expires in ${VERIFICATION_HOURS} hours. If you didn't create a Dotkeep account, you can ignore this email.`,
    ].join("\n");

    // The name is typed by the person signing up, so it is escaped before it goes into HTML.
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#0b1b33;line-height:1.6">
  <p>Hi ${escapeHtml(name)},</p>
  <p>Confirm your email address to finish setting up your Dotkeep account.</p>
  <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#1f4fd8;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Verify my email</a></p>
  <p style="font-size:13px;color:#5b6478">Or copy this link into your browser:<br>${escapeHtml(link)}</p>
  <p style="font-size:13px;color:#5b6478">This link works once and expires in ${VERIFICATION_HOURS} hours. If you didn't create a Dotkeep account, you can ignore this email.</p>
</div>`;

    await sendMail({ to: user.email, subject: "Verify your email for Dotkeep", text, html });
    return "sent";
  } catch (error) {
    console.error("verification email failed", error instanceof Error ? error.message : error);
    await cancelVerifications(user._id).catch(() => {});
    return "failed";
  }
}
