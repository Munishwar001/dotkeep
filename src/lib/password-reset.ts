import { logError } from "./logger";
import type { ObjectId } from "mongodb";
import { cancelPasswordResets, createPasswordReset, RESET_MINUTES } from "@/db/password-resets";
import type { SendResult } from "./email-verification";
import { appUrl, sendMail } from "./mail";
import { actionEmailHtml, noticeEmailHtml } from "./mail-html";

/**
 * Makes a fresh reset link and emails it. Never throws (same results as sendVerificationEmail):
 * "sent", "cooldown" (asked again within a minute), or "failed" (the link is cancelled so they can ask again).
 */
export async function sendPasswordResetEmail(user: { _id: ObjectId; name: string; email: string }): Promise<SendResult> {
  const created = await createPasswordReset(user._id);
  if ("cooldown" in created) return "cooldown";

  try {
    const link = `${appUrl()}/reset-password?token=${encodeURIComponent(created.token)}`;
    const name = user.name.trim() || "there";
    const intro = "We received a request to reset the password for your Dotkeep account.";
    const outro = `This link works once and expires in ${RESET_MINUTES} minutes. If you didn't ask for this, you can ignore this email: your password stays the same.`;
    const text = [`Hi ${name},`, "", intro, "", "Choose a new password here:", "", link, "", outro].join("\n");

    await sendMail({
      to: user.email,
      subject: "Reset your Dotkeep password",
      text,
      html: actionEmailHtml({ name, intro, buttonLabel: "Choose a new password", url: link, outro }),
    });
    return "sent";
  } catch (error) {
    await logError(error, "password reset email failed");
    await cancelPasswordResets(user._id).catch(() => {});
    return "failed";
  }
}

/** Tells the owner their password was changed, so a change they didn't make doesn't go unnoticed. Never throws. */
export async function sendPasswordChangedEmail(user: { name: string; email: string }): Promise<void> {
  try {
    const name = user.name.trim() || "there";
    const paragraphs = [
      "The password for your Dotkeep account was just changed, and you were signed out on your other devices.",
      `If this was you, there's nothing more to do. If it wasn't, reset your password right away at ${appUrl()}/forgot-password.`,
    ];
    await sendMail({
      to: user.email,
      subject: "Your Dotkeep password was changed",
      text: [`Hi ${name},`, "", ...paragraphs.flatMap((p) => [p, ""])].join("\n").trimEnd(),
      html: noticeEmailHtml({ name, paragraphs }),
    });
  } catch (error) {
    await logError(error, "password changed email failed");
  }
}
