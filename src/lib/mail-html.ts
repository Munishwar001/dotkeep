/** HTML for the emails we send. Everything a person typed (like their name) is escaped before it goes into HTML. */

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const wrapper = (inner: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#0b1b33;line-height:1.6">\n${inner}\n</div>`;

/** An email with one button (verify your email, reset your password). */
export function actionEmailHtml(options: { name: string; intro: string; buttonLabel: string; url: string; outro: string }): string {
  return wrapper(`  <p>Hi ${escapeHtml(options.name)},</p>
  <p>${escapeHtml(options.intro)}</p>
  <p><a href="${escapeHtml(options.url)}" style="display:inline-block;background:#1f4fd8;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escapeHtml(options.buttonLabel)}</a></p>
  <p style="font-size:13px;color:#5b6478">Or copy this link into your browser:<br>${escapeHtml(options.url)}</p>
  <p style="font-size:13px;color:#5b6478">${escapeHtml(options.outro)}</p>`);
}

/** A plain notice with no button (for example "your password was changed"). */
export function noticeEmailHtml(options: { name: string; paragraphs: string[] }): string {
  return wrapper(`  <p>Hi ${escapeHtml(options.name)},</p>\n${options.paragraphs.map((p) => `  <p>${escapeHtml(p)}</p>`).join("\n")}`);
}
