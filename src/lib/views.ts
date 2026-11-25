/**
 * NEXUS BANK — view registry. Single source of truth for navigation.
 */
export type ViewId =
  | "hub"
  | "dashboard"
  | "cards"
  | "shopping"
  | "followups"
  | "transactions"
  | "disputes"
  | "insights"
  | "security"
  | "roadmap"
  | "settings";

export interface ViewDef {
  id: ViewId;
  label: string;
  description: string;
  group: "Overview" | "Money" | "Protection" | "Intelligence" | "Trust";
}

export const VIEWS: ViewDef[] = [
  { id: "hub", label: "Home", description: "Everything organized — start here", group: "Overview" },
  { id: "dashboard", label: "Accounts & Dashboard", description: "Balances, activity and what needs your attention", group: "Overview" },
  { id: "cards", label: "Cards", description: "Realistic card management: controls, freeze, limits, replacement", group: "Money" },
  { id: "shopping", label: "Shopping & Purchases", description: "Record online purchases, merchant rules and receipts", group: "Money" },
  { id: "transactions", label: "Transactions", description: "Search, filter and inspect every movement", group: "Money" },
  { id: "followups", label: "Follow-up Centre", description: "4-day purchase monitoring: confirm delivery, act on problems", group: "Protection" },
  { id: "disputes", label: "Dispute Centre", description: "Genuine-issue disputes with full lifecycle tracking", group: "Protection" },
  { id: "insights", label: "Insights & Alerts", description: "Explainable transaction intelligence, budgets and analytics", group: "Intelligence" },
  { id: "security", label: "Security Centre", description: "Sessions, audit trail and honest protection status", group: "Trust" },
  { id: "roadmap", label: "2027 Roadmap", description: "Evaluated banking technology roadmap", group: "Trust" },
  { id: "settings", label: "Settings", description: "Profile, password and data controls", group: "Trust" },
];
