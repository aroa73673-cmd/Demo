/**
 * NEXUS BANK — money primitives.
 * All amounts are integers in minor units (pence). Never use floats for money.
 */

export const CURRENCIES = ["GBP", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

const CURRENCY_SYMBOL: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
};

export function currencySymbol(c: string): string {
  return CURRENCY_SYMBOL[c] ?? c + " ";
}

/** Format minor units into a human money string, e.g. 128499 -> "£1,284.99" */
export function fmtMoney(amountMinor: number, currency = "GBP"): string {
  const sign = amountMinor < 0 ? "-" : "";
  const abs = Math.abs(amountMinor);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${currencySymbol(currency)}${whole.toLocaleString("en-GB")}.${frac}`;
}

/** Compact signed form for ledgers, e.g. -3499 -> "-£34.99" */
export function fmtSigned(amountMinor: number, direction: "DEBIT" | "CREDIT", currency = "GBP"): string {
  const base = fmtMoney(Math.abs(amountMinor), currency);
  return direction === "DEBIT" ? `-${base}` : `+${base}`;
}

/** Parse a user-entered decimal string into minor units. Returns null on invalid input. */
export function parseAmountToMinor(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const minor = parseInt(whole, 10) * 100 + parseInt((frac + "00").slice(0, 2) || "0", 10);
  if (!Number.isSafeInteger(minor)) return null;
  return minor;
}

export function clampMoney(minor: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, minor));
}

/** Add N days to a date (pure). */
export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + n);
  return out;
}

/** Start of day for a date (pure). */
export function startOfDay(d: Date): Date {
  const out = new Date(d.getTime());
  out.setHours(0, 0, 0, 0);
  return out;
}

/** First day of the month containing d (pure). */
export function startOfMonth(d: Date): Date {
  const out = new Date(d.getTime());
  out.setDate(1);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** UTC timestamp label used on receipts / audit entries. */
export function isoLabel(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}
