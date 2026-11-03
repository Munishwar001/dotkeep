import { logError } from "./logger";
import { appUrl, sendMail } from "./mail";
import { noticeEmailHtml } from "./mail-html";

/** Warn when this few recovery codes are left (or fewer). */
export const LOW_RECOVERY_CODES = 2;

type Recipient = { name: string; email: string };

async function sendNotice(user: Recipient, subject: string, paragraphs: string[], what: string): Promise<void> {
  try {
    const name = user.name.trim() || "there";
    await sendMail({
      to: user.email,
      subject,
      text: [`Hi ${name},`, "", ...paragraphs.flatMap((p) => [p, ""])].join("\n").trimEnd(),
      html: noticeEmailHtml({ name, paragraphs }),
    });
  } catch (error) {
    await logError(error, `${what} email failed`);
  }
}

const notYou = () => `If this wasn't you, reset your password right away at ${appUrl()}/forgot-password.`;

/** Tells the owner 2FA was turned on or off, or that their recovery codes were replaced. Never throws. */
export function sendTwoFactorChangedEmail(user: Recipient, change: "enabled" | "disabled" | "recovery-codes"): Promise<void> {
  const copy = {
    enabled: ["Two-factor authentication was turned on for your Dotkeep account.", "Your Dotkeep two-factor authentication is on"],
    disabled: ["Two-factor authentication was turned off for your Dotkeep account.", "Your Dotkeep two-factor authentication is off"],
    "recovery-codes": ["New recovery codes were created for your Dotkeep account. The old ones no longer work.", "Your Dotkeep recovery codes were replaced"],
  }[change];
  return sendNotice(user, copy[1], [copy[0], notYou()], "two-factor changed");
}

/** Sent after a recovery code is used and few are left. Never throws. */
export function sendLowRecoveryCodesEmail(user: Recipient, left: number): Promise<void> {
  const paragraphs = [
    left === 0 ? "You just used your last recovery code." : `You have ${left} recovery code${left === 1 ? "" : "s"} left.`,
    "If you lose your authenticator app without a recovery code, you can't sign in. Create new codes in Settings → Two-factor authentication.",
  ];
  return sendNotice(user, "You're running low on Dotkeep recovery codes", paragraphs, "low recovery codes");
}
