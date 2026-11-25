/**
 * NEXUS BANK — zod validation schemas. Every API route validates its input here.
 * Enum-like values are plain strings (SQLite) but constrained to exact vocabularies.
 */
import { z } from "zod";

export const TXN_STATUSES = [
  "PENDING",
  "COMPLETED",
  "DECLINED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "DISPUTED",
  "CANCELLED",
] as const;
export const TXN_METHODS = ["ONLINE", "POS", "TRANSFER", "SUBSCRIPTION", "ATM"] as const;
export const TXN_DIRECTIONS = ["DEBIT", "CREDIT"] as const;
export const CARD_KINDS = ["DEBIT", "CREDIT", "VIRTUAL"] as const;
export const CARD_NETWORKS = ["VISA", "MASTERCARD"] as const;
export const CARD_STATUSES = ["ACTIVE", "FROZEN", "BLOCKED", "REPLACED"] as const;
export const DISPUTE_REASONS = ["UNAUTHORIZED", "NOT_RECEIVED", "NOT_AS_DESCRIBED", "DUPLICATE", "OTHER"] as const;
export const DISPUTE_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "PROVISIONAL_CREDIT",
  "RESOLVED_WON",
  "RESOLVED_LOST",
  "WITHDRAWN",
] as const;
export const REFUND_STATUSES = ["REQUESTED", "CONFIRMED", "DECLINED", "CANCELLED"] as const;
export const CATEGORIES = [
  "Groceries",
  "Dining",
  "Transport",
  "Electronics",
  "Clothing",
  "Subscriptions",
  "Digital Services",
  "Home & Appliances",
  "Health",
  "Entertainment",
  "Travel",
  "Other",
] as const;

const strongPassword = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128)
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a digit");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  password: strongPassword,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(200),
  password: z.string().min(1, "Password is required").max(128),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: strongPassword,
});

export const cardPolicySchema = z.object({
  perTxLimitMinor: z.number().int().min(100).max(50_000_00).optional(),
  dailyLimitMinor: z.number().int().min(100).max(200_000_00).optional(),
  monthlyLimitMinor: z.number().int().min(100).max(1_000_000_00).optional(),
  onlineAllowed: z.boolean().optional(),
  contactlessAllowed: z.boolean().optional(),
  internationalAllowed: z.boolean().optional(),
  atmAllowed: z.boolean().optional(),
  label: z.string().trim().min(1).max(40).optional(),
});

export const cardCreateSchema = z.object({
  accountId: z.string().min(1),
  label: z.string().trim().min(1).max(40),
  kind: z.enum(CARD_KINDS),
  network: z.enum(CARD_NETWORKS),
  holderName: z.string().trim().min(2).max(60),
  perTxLimitMinor: z.number().int().min(100).max(50_000_00).default(50_000),
  dailyLimitMinor: z.number().int().min(100).max(200_000_00).default(100_000),
  monthlyLimitMinor: z.number().int().min(100).max(1_000_000_00).default(500_000),
  onlineAllowed: z.boolean().default(true),
  contactlessAllowed: z.boolean().default(true),
  internationalAllowed: z.boolean().default(false),
  atmAllowed: z.boolean().default(false),
});

export const freezeSchema = z.object({ frozen: z.boolean() });

export const replaceSchema = z.object({
  reason: z.enum(["LOST", "STOLEN", "DAMAGED", "COMPROMISED"]).refine((v) => v.length > 0, {}),
});

export const merchantRuleSchema = z.object({
  displayName: z.string().trim().min(2, "Merchant name is required").max(80),
  blocked: z.boolean().default(false),
  monthlyLimitMinor: z.number().int().min(100).max(200_000_00).nullable().optional(),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export const merchantRulePatchSchema = z.object({
  blocked: z.boolean().optional(),
  monthlyLimitMinor: z.number().int().min(100).max(200_000_00).nullable().optional(),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export const transactionCreateSchema = z.object({
  accountId: z.string().min(1),
  cardId: z.string().min(1).optional().nullable(),
  direction: z.enum(TXN_DIRECTIONS).default("DEBIT"),
  merchantName: z.string().trim().min(2, "Merchant is required").max(80),
  category: z.enum(CATEGORIES),
  method: z.enum(TXN_METHODS),
  amountMinor: z.number().int().min(1, "Amount must be positive").max(50_000_00),
  currency: z.enum(["GBP", "USD", "EUR"]).default("GBP"),
  orderRef: z.string().trim().max(40).optional().or(z.literal("")),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  simulateDecline: z.boolean().optional(),
});

export const statusUpdateSchema = z.object({
  status: z.enum(["COMPLETED", "DECLINED", "CANCELLED"]),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export const refundCreateSchema = z.object({
  amountMinor: z.number().int().min(1, "Refund amount must be positive").max(50_000_00),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export const refundResolveSchema = z.object({
  refundId: z.string().min(1),
  status: z.enum(["CONFIRMED", "DECLINED", "CANCELLED"]),
  providerRef: z.string().trim().max(60).optional().or(z.literal("")),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export const disputeCreateSchema = z.object({
  reason: z.enum(DISPUTE_REASONS),
  description: z.string().trim().min(20, "Describe the issue in at least 20 characters so the dispute team can act").max(2000),
  confirmGenuine: z.boolean().refine((v) => v === true, {
    message: "You must confirm the dispute is genuine and understood",
  }),
});

export const disputeAdvanceSchema = z.object({
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export const followUpResolveSchema = z.object({
  orderReceived: z.boolean(),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export const budgetSchema = z.object({
  category: z.enum(CATEGORIES),
  monthlyLimitMinor: z.number().int().min(100).max(200_000_00),
});

export const alertReadSchema = z.object({
  ids: z.array(z.string()).max(200).optional(),
  all: z.boolean().optional(),
});

export const accountCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  type: z.enum(["CURRENT", "SAVINGS"]),
});

/** Normalize a merchant name to its rule key: lowercase, strip non-alphanumerics. */
export function merchantKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 80);
}

export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;
export type CardPolicyPatch = z.infer<typeof cardPolicySchema>;
