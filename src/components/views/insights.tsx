"use client";

/**
 * NEXUS BANK — Insights. Transaction intelligence: spend analytics, budgets
 * and the explainable alert feed. Every alert renders its full explanation —
 * the reasoning is never truncated.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, SectionCard, StatCard, DemoBadge, SeverityBadge, EmptyState, LoadingBlock, ErrorNote, fmtDateTime, fmtDate } from "@/lib/bank-ui";
import { bankApi, nestedErrorText } from "@/lib/bank-client";
import { fmtMoney, parseAmountToMinor } from "@/lib/money";
import { AlertDTO, BudgetDTO, InsightSummary } from "@/lib/types";
import { CATEGORIES } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface BudgetsPayload {
  budgets: BudgetDTO[];
}
interface AlertsPayload {
  alerts: AlertDTO[];
  unreadCount: number;
}

const PIE_COLORS = ["#34d399", "#fbbf24", "#f87171", "#22d3ee", "#a78bfa", "#a1a1aa"];
const PIE_DOTS = ["bg-emerald-400", "bg-amber-400", "bg-rose-400", "bg-cyan-400", "bg-violet-400", "bg-zinc-400"];

const TOOLTIP_STYLE = {
  backgroundColor: "#18181b",
  border: "1px solid #27272a",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#e4e4e7",
} as const;

const COUNT_TONES = {
  zinc: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  rose: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  violet: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  sky: "border-sky-500/40 bg-sky-500/10 text-sky-400",
} as const;

type CountTone = keyof typeof COUNT_TONES;

function CountChip({ label, count, tone }: { label: string; count: number; tone: CountTone }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-lg border px-3 py-1.5", COUNT_TONES[tone])}>
      <span className="nb-num text-sm font-bold">{count}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
    </span>
  );
}

function axisGbp(v: number): string {
  return `£${v.toLocaleString("en-GB")}`;
}

function tooltipGbp(value: number | string | Array<number | string>): string {
  const v = Array.isArray(value) ? value[0] : value;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? fmtMoney(Math.round(n * 100)) : String(v);
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return fmtDate(iso);
}

function budgetBarClass(pct: number): string {
  if (pct >= 100) return "[&>[data-slot=progress-indicator]]:bg-rose-400";
  if (pct >= 80) return "[&>[data-slot=progress-indicator]]:bg-amber-400";
  return "[&>[data-slot=progress-indicator]]:bg-emerald-400";
}

function budgetPctClass(pct: number): string {
  if (pct >= 100) return "border-rose-500/40 bg-rose-500/10 text-rose-400";
  if (pct >= 80) return "border-amber-500/40 bg-amber-500/10 text-amber-400";
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
}

export function InsightsView() {
  const { toast } = useToast();

  const [insights, setInsights] = useState<InsightSummary | null>(null);
  const [insightsErr, setInsightsErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [budgets, setBudgets] = useState<BudgetDTO[]>([]);
  const [budgetsErr, setBudgetsErr] = useState("");
  const [budgetsLoading, setBudgetsLoading] = useState(true);

  const [alertsData, setAlertsData] = useState<AlertsPayload | null>(null);
  const [alertsErr, setAlertsErr] = useState("");
  const [alertsLoading, setAlertsLoading] = useState(true);

  // Budget form + delete confirm
  const [newCategory, setNewCategory] = useState("");
  const [limitInput, setLimitInput] = useState("");
  const [formError, setFormError] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BudgetDTO | null>(null);
  const [deletingBudget, setDeletingBudget] = useState(false);

  // Alerts
  const [alertFilter, setAlertFilter] = useState<"ALL" | "UNREAD">("ALL");

  const loadBudgets = useCallback(async () => {
    setBudgetsLoading(true);
    setBudgetsErr("");
    try {
      const data = await bankApi.get<BudgetsPayload>("/budgets");
      setBudgets(data.budgets);
    } catch (err) {
      setBudgetsErr(nestedErrorText(err));
    } finally {
      setBudgetsLoading(false);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setAlertsErr("");
    try {
      setAlertsData(await bankApi.get<AlertsPayload>("/alerts"));
    } catch (err) {
      setAlertsErr(nestedErrorText(err));
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setInsightsErr("");
    try {
      setInsights(await bankApi.get<InsightSummary>("/insights"));
    } catch (err) {
      setInsightsErr(nestedErrorText(err));
    } finally {
      setLoading(false);
    }
    await Promise.all([loadBudgets(), loadAlerts()]);
  }, [loadBudgets, loadAlerts]);

  useEffect(() => {
    load();
  }, [load]);

  const trendData = useMemo(
    () =>
      (insights?.monthlyTrend ?? []).map((m) => ({
        label: m.label,
        spend: m.spendMinor / 100,
        income: m.incomeMinor / 100,
      })),
    [insights],
  );

  const pieData = useMemo(
    () =>
      (insights?.byCategory ?? []).slice(0, 6).map((c) => ({
        name: c.category,
        value: c.totalMinor / 100,
      })),
    [insights],
  );

  const pieTotal = useMemo(() => pieData.reduce((sum, d) => sum + d.value, 0), [pieData]);

  const visibleAlerts = useMemo(() => {
    const list = alertsData?.alerts ?? [];
    return alertFilter === "UNREAD" ? list.filter((a) => !a.read) : list;
  }, [alertsData, alertFilter]);

  const unreadCount = alertsData?.unreadCount ?? 0;

  async function submitBudget() {
    setFormError("");
    if (!newCategory) {
      setFormError("Choose a category first.");
      return;
    }
    const minor = parseAmountToMinor(limitInput);
    if (minor === null) {
      setFormError("Enter a valid monthly limit, e.g. 250.00");
      return;
    }
    if (minor < 100) {
      setFormError("The minimum monthly limit is £1.00.");
      return;
    }
    if (minor > 200_000_00) {
      setFormError("The maximum monthly limit is £200,000.00.");
      return;
    }
    setSavingBudget(true);
    try {
      await bankApi.post("/budgets", { category: newCategory, monthlyLimitMinor: minor });
      toast({ title: "Budget saved", description: `${newCategory} — monthly limit ${fmtMoney(minor)}` });
      setLimitInput("");
      await loadBudgets();
    } catch (err) {
      toast({ title: "Could not save budget", description: nestedErrorText(err), variant: "destructive" });
    } finally {
      setSavingBudget(false);
    }
  }

  async function confirmDeleteBudget() {
    if (!deleteTarget) return;
    setDeletingBudget(true);
    try {
      await bankApi.del(`/budgets?id=${encodeURIComponent(deleteTarget.id)}`);
      toast({ title: "Budget removed", description: `${deleteTarget.category} is no longer tracked.` });
      setDeleteTarget(null);
      await loadBudgets();
    } catch (err) {
      toast({ title: "Could not remove budget", description: nestedErrorText(err), variant: "destructive" });
    } finally {
      setDeletingBudget(false);
    }
  }

  async function markAlertRead(id: string) {
    try {
      await bankApi.post("/alerts/read", { ids: [id] });
      setAlertsData((prev) =>
        prev
          ? {
              alerts: prev.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)),
              unreadCount: Math.max(0, prev.unreadCount - 1),
            }
          : prev,
      );
    } catch (err) {
      toast({ title: "Could not mark alert read", description: nestedErrorText(err), variant: "destructive" });
    }
  }

  async function markAllAlertsRead() {
    try {
      await bankApi.post("/alerts/read", { all: true });
      setAlertsData((prev) =>
        prev ? { alerts: prev.alerts.map((a) => ({ ...a, read: true })), unreadCount: 0 } : prev,
      );
      toast({ title: "All alerts marked read" });
    } catch (err) {
      toast({ title: "Could not mark alerts read", description: nestedErrorText(err), variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Intelligence"
        title="Insights & Analytics"
        description="Spend analytics computed from your recorded demo transactions, category budgets, and an alert feed where every alert explains why it fired."
        actions={
          <>
            <DemoBadge />
            <Button variant="outline" size="sm" className="border-zinc-700" onClick={load} disabled={loading && budgetsLoading && alertsLoading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        }
      />

      {/* ---------- Top stats ---------- */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : insightsErr ? (
        <div className="space-y-3">
          <ErrorNote message={insightsErr} />
          <Button variant="outline" size="sm" className="border-zinc-700" onClick={load}>
            Retry
          </Button>
        </div>
      ) : insights ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Spent today" value={fmtMoney(insights.todayMinor)} sub="Debit transactions recorded today" />
            <StatCard label="Spent this week" value={fmtMoney(insights.weekMinor)} sub="Rolling 7-day window" />
            <StatCard label="Spent this month" value={fmtMoney(insights.monthMinor)} sub={`Income ${fmtMoney(insights.incomeMonthMinor)} this month`} tone="default" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CountChip label="Pending" count={insights.counts.pending} tone="amber" />
            <CountChip label="Completed" count={insights.counts.completed} tone="emerald" />
            <CountChip label="Declined" count={insights.counts.declined} tone="rose" />
            <CountChip label="Disputed" count={insights.counts.disputed} tone="violet" />
            <CountChip label="Refunds" count={insights.counts.refunds} tone="sky" />
          </div>

          {/* ---------- Charts ---------- */}
          <div className="grid gap-4 lg:grid-cols-5">
            <SectionCard
              title="Monthly cash flow"
              description="Debit spend against income, converted to pounds. Recorded months only."
              className="lg:col-span-3"
              actions={<DemoBadge tooltip="Demo analytics — computed from sandbox transactions." />}
            >
              {trendData.length === 0 ? (
                <EmptyState
                  title="No trend data yet"
                  hint="Record a few demo transactions and the monthly spend/income bars will appear here."
                />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#52525b" }} />
                      <YAxis stroke="#52525b" tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} axisLine={false} width={52} tickFormatter={axisGbp} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        itemStyle={{ color: "#e4e4e7" }}
                        labelStyle={{ color: "#e4e4e7" }}
                        cursor={{ fill: "oklch(1 0 0 / 4%)" }}
                        formatter={tooltipGbp}
                      />
                      <Bar dataKey="spend" name="Spent" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="income" name="Income" fill="#fbbf24" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Where spending goes"
              description="Top categories this month, with each slice's share of recorded spend."
              className="lg:col-span-2"
            >
              {pieData.length === 0 || pieTotal <= 0 ? (
                <EmptyState title="No category data yet" hint="Categorised demo transactions will break down by share here." />
              ) : (
                <div className="grid gap-4 sm:grid-cols-[1fr_minmax(200px,0.7fr)] sm:items-center">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "#e4e4e7" }} labelStyle={{ color: "#e4e4e7" }} formatter={tooltipGbp} />
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2} stroke="#18181b" strokeWidth={2}>
                          {pieData.map((d, i) => (
                            <Cell key={d.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {pieData.map((d, i) => {
                      const pct = Math.round((d.value / pieTotal) * 100);
                      return (
                        <div key={d.name} className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PIE_DOTS[i % PIE_DOTS.length])} />
                            <span className="truncate text-zinc-300">{d.name}</span>
                          </span>
                          <span className="nb-num shrink-0 text-zinc-400">
                            {fmtMoney(Math.round(d.value * 100))} · {pct}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </SectionCard>
          </div>
        </>
      ) : (
        <EmptyState title="Nothing loaded" hint="Refresh to retry." />
      )}

      {/* ---------- Budgets ---------- */}
      <SectionCard
        title="Category budgets"
        description="Monthly limits per category. Bars turn amber at 80% and rose once the limit is exceeded; breaching transactions raise an explainable alert."
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="budget-category" className="text-xs text-zinc-400">
              Category
            </Label>
            <Select value={newCategory} onValueChange={setNewCategory}>
              <SelectTrigger id="budget-category" className="min-h-[44px]">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget-limit" className="text-xs text-zinc-400">
              Monthly limit (£)
            </Label>
            <Input
              id="budget-limit"
              inputMode="decimal"
              placeholder="250.00"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="min-h-[44px]"
            />
          </div>
          <Button onClick={submitBudget} disabled={savingBudget} className="min-h-[44px]">
            {savingBudget ? "Saving…" : "Set budget"}
          </Button>
        </div>
        {formError ? <p className="mt-2 text-xs text-rose-400">{formError}</p> : null}

        <div className="mt-5">
          {budgetsErr ? (
            <div className="space-y-3">
              <ErrorNote message={budgetsErr} />
              <Button variant="outline" size="sm" className="border-zinc-700" onClick={loadBudgets}>
                Retry
              </Button>
            </div>
          ) : budgetsLoading ? (
            <LoadingBlock rows={3} />
          ) : budgets.length === 0 ? (
            <EmptyState title="No budgets yet" hint="Set a monthly limit for any category above and it will track every recorded spend against it." />
          ) : (
            <div className="space-y-3">
              {budgets.map((b) => {
                const pct = b.monthlyLimitMinor > 0 ? Math.round((b.spentThisMonthMinor / b.monthlyLimitMinor) * 100) : 0;
                return (
                  <div key={b.id} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-200">{b.category}</p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          <span className="nb-num">{fmtMoney(b.spentThisMonthMinor)}</span> of <span className="nb-num">{fmtMoney(b.monthlyLimitMinor)}</span> this month
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={cn("nb-num rounded border px-1.5 py-0.5 text-[10px] font-bold", budgetPctClass(pct))}>{pct}%</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-400 hover:bg-rose-500/10"
                          onClick={() => setDeleteTarget(b)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    <Progress className="mt-2.5 h-1.5" value={Math.min(100, pct)} aria-label={`${b.category} budget usage`} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ---------- Alerts feed ---------- */}
      <SectionCard
        title="Alert feed"
        description="Every alert carries its full explanation — read the reasoning, not just the headline. Unread alerts are emphasised."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700"
            onClick={markAllAlertsRead}
            disabled={alertsLoading || unreadCount === 0}
          >
            Mark all read
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setAlertFilter("ALL")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              alertFilter === "ALL"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-border/70 text-zinc-400 hover:bg-muted/40",
            )}
          >
            All
          </button>
          <button
            onClick={() => setAlertFilter("UNREAD")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              alertFilter === "UNREAD"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-border/70 text-zinc-400 hover:bg-muted/40",
            )}
          >
            Unread{unreadCount > 0 ? ` · ${unreadCount}` : ""}
          </button>
        </div>

        <div className="mt-4">
          {alertsErr ? (
            <div className="space-y-3">
              <ErrorNote message={alertsErr} />
              <Button variant="outline" size="sm" className="border-zinc-700" onClick={loadAlerts}>
                Retry
              </Button>
            </div>
          ) : alertsLoading ? (
            <LoadingBlock rows={4} />
          ) : visibleAlerts.length === 0 ? (
            <EmptyState
              title={alertFilter === "UNREAD" ? "No unread alerts" : "No alerts yet"}
              hint="The intelligence engine watches every recorded transaction and explains itself when something stands out."
            />
          ) : (
            <div className="max-h-[520px] space-y-3 overflow-y-auto nb-scroll pr-1">
              {visibleAlerts.map((a) => (
                <article
                  key={a.id}
                  className={cn(
                    "rounded-xl border p-4",
                    a.read ? "border-border/70 bg-muted/20" : "border-emerald-500/30 bg-emerald-500/5",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={a.severity} />
                      <p className="text-sm font-semibold text-zinc-100">{a.title}</p>
                    </div>
                    <span className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                      {a.type}
                    </span>
                  </div>

                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">{a.explanation}</p>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                      <span>{relTime(a.createdAt)}</span>
                      <span aria-hidden>·</span>
                      <span>{fmtDateTime(a.createdAt)}</span>
                      {a.transactionId ? (
                        <span className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                          txn …{a.transactionId.slice(-6)}
                        </span>
                      ) : null}
                    </div>
                    {!a.read ? (
                      <Button variant="ghost" size="sm" className="text-emerald-400 hover:bg-emerald-500/10" onClick={() => markAlertRead(a.id)}>
                        Mark read
                      </Button>
                    ) : (
                      <span className="text-[11px] uppercase tracking-wide text-zinc-600">Read</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ---------- Delete budget confirm ---------- */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove budget?</DialogTitle>
            <DialogDescription>
              The {deleteTarget?.category} budget will stop tracking immediately. Recorded spending is not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-zinc-700" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteBudget} disabled={deletingBudget}>
              {deletingBudget ? "Removing…" : "Remove budget"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
