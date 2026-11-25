/**
 * NEXUS BANK — data masking. Sensitive values never leave the server unmasked.
 */

/** Mask any long number to keep only the last 4 digits: "4539 8821 0034 1187" -> "**** **** **** 1187" */
export function maskPan(last4: string): string {
  return `**** **** **** ${last4}`;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(2, local.length - 2))}@${domain}`;
}

export function maskTail(value: string): string {
  if (value.length <= 4) return "****";
  return `${"*".repeat(Math.min(10, value.length - 4))}${value.slice(-4)}`;
}

/**
 * Enforce that a user-supplied string cannot smuggle card-like credentials into
 * free-text fields. We never store CVV or full PANs anywhere; this redacts any
 * digit run of 13+ digits (PANs are 13-19 digits, spaces tolerated) while
 * leaving ordinary text and short numbers untouched.
 */
export function sanitizeFreeText(input: string): string {
  return input
    .replace(/[\d][\d -]*[\d]/g, (m) => (m.replace(/\D/g, "").length >= 13 ? "[redacted number sequence]" : m))
    .trim();
}
