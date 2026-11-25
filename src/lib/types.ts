/**
 * NEXUS BANK — shared DTO contracts between API routes and the frontend.
 * Single source of truth; frontend components import from here.
 */

export type DemoLabel = { isDemo: true };

export interface MeResponse {
  user: { id: string; email: string; name: string };
  accounts: AccountDTO[];
}

export interface AccountDTO {
  id: string;
  name: string;
  type: "CURRENT" | "SAVINGS";
  currency: string;
  balanceMinor: number;
  isDemo: boolean;
}

export interface CardDTO {
  id: string;
  accountId: string;
  label: string;
  kind: "DEBIT" | "CREDIT" | "VIRTUAL";
  network: "VISA" | "MASTERCARD";
  holderName: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  status: "ACTIVE" | "FROZEN" | "BLOCKED" | "REPLACED";
  perTxLimitMinor: number;
  dailyLimitMinor: number;
  monthlyLimitMinor: number;
  onlineAllowed: boolean;
  contactlessAllowed: boolean;
  internationalAllowed: boolean;
  atmAllowed: boolean;
  isDemo: boolean;
  spentTodayMinor?: number;
  spentThisMonthMinor?: number;
}

export interface MerchantRuleDTO {
  id: string;
  name: string;
  displayName: string;
  blocked: boolean;
  monthlyLimitMinor: number | null;
  note: string | null;
  spentThisMonthMinor?: number;
}

export interface TransactionDTO {
  id: string;
  accountId: string;
  cardId: string | null;
  direction: "DEBIT" | "CREDIT";
  amountMinor: number;
  currency: string;
  merchantName: string;
  merchantCategory: string | null;
  category: string;
  status: "PENDING" | "COMPLETED" | "DECLINED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "DISPUTED" | "CANCELLED";
  method: "ONLINE" | "POS" | "TRANSFER" | "SUBSCRIPTION" | "ATM";
  orderRef: string | null;
  description: string | null;
  refundedMinor: number;
  isDemo: boolean;
  createdAt: string;
  postedAt: string | null;
  cardLabel?: string | null;
  cardLast4?: string | null;
  accountName?: string;
  hasFollowUp?: boolean;
  disputeStatus?: string | null;
}

export interface TransactionDetailDTO extends TransactionDTO {
  refunds: RefundDTO[];
  disputes: DisputeDTO[];
  followUps: FollowUpDTO[];
  alerts: AlertDTO[];
  timeline: TimelineEvent[];
}

export interface TimelineEvent {
  at: string;
  event: string;
  detail: string;
}

export interface RefundDTO {
  id: string;
  transactionId: string;
  amountMinor: number;
  status: "REQUESTED" | "CONFIRMED" | "DECLINED" | "CANCELLED";
  providerRef: string | null;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface FollowUpDTO {
  id: string;
  transactionId: string;
  dueAt: string;
  status: "PENDING" | "RESOLVED" | "CANCELLED";
  orderReceived: boolean | null;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  transaction?: TransactionDTO;
  daysRemaining?: number;
  isDue?: boolean;
}

export interface DisputeTimelineEntry {
  at: string;
  event: string;
  detail: string;
}

export interface DisputeDTO {
  id: string;
  transactionId: string;
  reason: "UNAUTHORIZED" | "NOT_RECEIVED" | "NOT_AS_DESCRIBED" | "DUPLICATE" | "OTHER";
  description: string;
  status: "SUBMITTED" | "UNDER_REVIEW" | "PROVISIONAL_CREDIT" | "RESOLVED_WON" | "RESOLVED_LOST" | "WITHDRAWN";
  timeline: DisputeTimelineEntry[];
  createdAt: string;
  updatedAt: string;
  transaction?: TransactionDTO;
}

export interface AlertDTO {
  id: string;
  type: string;
  severity: "INFO" | "WARN" | "CRITICAL";
  title: string;
  explanation: string;
  transactionId: string | null;
  read: boolean;
  createdAt: string;
}

export interface BudgetDTO {
  id: string;
  category: string;
  monthlyLimitMinor: number;
  spentThisMonthMinor: number;
}

export interface InsightSummary {
  todayMinor: number;
  weekMinor: number;
  monthMinor: number;
  incomeMonthMinor: number;
  byCategory: { category: string; totalMinor: number; count: number }[];
  byMerchant: { merchantName: string; totalMinor: number; count: number }[];
  monthlyTrend: { label: string; spendMinor: number; incomeMinor: number }[];
  budgetStatus: { category: string; limitMinor: number; spentMinor: number; pct: number }[];
  counts: { pending: number; completed: number; declined: number; disputed: number; refunds: number };
}

export interface OverviewDTO {
  totalBalanceMinor: number;
  accounts: AccountDTO[];
  cards: { total: number; frozen: number; virtual: number };
  thisWeekSpendMinor: number;
  pendingCount: number;
  pendingTotalMinor: number;
  followUpsDue: FollowUpDTO[];
  unreadAlerts: AlertDTO[];
  recentTransactions: TransactionDTO[];
  demoNotice: string;
}

export interface SecurityDTO {
  sessions: { id: string; ip: string | null; userAgent: string | null; createdAt: string; lastSeen: string; expiresAt: string; current: boolean }[];
  auditEvents: { id: string; action: string; detail: string; createdAt: string }[];
  protections: { name: string; status: "ENABLED" | "PARTIAL"; detail: string }[];
}

export interface PolicyCheckDTO {
  name: string;
  result: "PASS" | "FAIL";
  detail: string;
}

export interface RecordPurchaseResponse {
  transaction: TransactionDTO;
  decision: "APPROVED" | "DECLINED";
  declinedBy?: string;
  reason?: string;
  checks: PolicyCheckDTO[];
  followUp: FollowUpDTO | null;
  alertsCreated: number;
}

export const FOLLOW_UP_DAYS = 4;
