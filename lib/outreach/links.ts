/**
 * Build local handoff links for the user's email and messaging apps.
 *
 * We encode each query value directly instead of using URLSearchParams.
 * URLSearchParams uses application/x-www-form-urlencoded rules and turns
 * spaces into `+`, which some mail clients display literally in mailto links.
 */
export function buildMailtoHref(
  recipient: string,
  subject: string,
  body: string,
) {
  const safeRecipient = recipient.trim().replace(/[\r\n?&#]/g, "");
  const safeSubject = subject.replace(/[\r\n]+/g, " ").trim();
  const emailBody = normalizeEmailLineEndings(body);

  return `mailto:${safeRecipient}?subject=${encodeURIComponent(safeSubject)}&body=${encodeURIComponent(emailBody)}`;
}

export function buildSmsHref(
  recipient: string,
  body: string,
  appleMobile: boolean,
) {
  const safeRecipient = normalizePhoneForLink(recipient);
  if (!safeRecipient) return "";

  const separator = appleMobile ? "&" : "?";
  const smsBody = body.replace(/\r\n?/g, "\n");
  return `sms:${safeRecipient}${separator}body=${encodeURIComponent(smsBody)}`;
}

export function normalizePhoneForLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const leadingPlus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 ? `${leadingPlus}${digits}` : "";
}

function normalizeEmailLineEndings(value: string) {
  return value.replace(/\r\n?|\n/g, "\r\n");
}
