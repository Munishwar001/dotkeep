import type { ObjectId } from "mongodb";
import { cancelVerifications, createVerification, VERIFICATION_HOURS } from "@/db/email-verifications";
import { appUrl, sendMail } from "./mail";
import { actionEmailHtml } from "./mail-html";

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
    const intro = "Confirm your email address to finish setting up your Dotkeep account.";
    const outro = `This link works once and expires in ${VERIFICATION_HOURS} hours. If you didn't create a Dotkeep account, you can ignore this email.`;
    const text = [`Hi ${name},`, "", intro, "", link, "", outro].join("\n");

    await sendMail({
      to: user.email,
      subject: "Verify your email for Dotkeep",
      text,
      html: actionEmailHtml({ name, intro, buttonLabel: "Verify my email", url: link, outro }),
    });
    return "sent";
  } catch (error) {
    console.error("verification email failed", error instanceof Error ? error.message : error);
    await cancelVerifications(user._id).catch(() => {});
    return "failed";
  }
}
