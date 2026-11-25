"use client";

/**
 * NEXUS BANK — Accounts & Dashboard. Live aggregation over the user's stored
 * demo records: balances, attention items, alert feed, recent activity.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader, StatCard, StatusBadge, DemoBadge, Money, LoadingBlock, ErrorNote, EmptyState, fmtDateTime } from "@/lib/bank-ui";
import { bankApi, nestedErrorText } from "@/lib/bank-client";
import { fmtMoney } from "@/lib/money";
import { OverviewDTO } from "@/lib/types";
import { ViewId } from "@/lib/views";

export function DashboardView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const [data, setData] = useState<OverviewDTO | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await bankApi.get<OverviewDTO>("/overview"));
    } catch (err) {
      setError(nestedErrorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Accounts"
        title="Accounts & Dashboard"
        description="Everything computed live from your stored demo records. Nothing is invented on the client — the API returns what is in the database."
        actions={
          <>
            <DemoBadge />
            <Button variant="outline" size="sm" className="border-zinc-700" onClick={load} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        }
      />

      <ErrorNote message={error} />

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/50" />
            ))}
          </div>
          <LoadingBlock rows={4} />
        </div>
      ) : data ? (
        <>
          {/* Balance hero */}
          <Card className="nb-grid-glow border-border bg-card">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="nb-kicker">Total demo balance</p>
                  <p className="nb-num mt-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">{fmtMoney(data.totalBalanceMinor)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{data.demoNotice}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 lg:gap-4">
                  <MiniStat label="This week" value={fmtMoney(data.thisWeekSpendMinor)} tone="default" />
                  <MiniStat label="Pending" value={fmtMoney(data.pendingTotalMinor)} tone="warning" />
                  <MiniStat label="Cards" value={`${data.cards.total}`} sub={data.cards.frozen > 0 ? `${data.cards.frozen} frozen` : "all active"} tone={data.cards.frozen > 0 ? "warning" : "positive"} />
                </div>
              </div>
              <Separator className="my-5" />
              <div className="grid gap-3 sm:grid-cols-2">
                {data.accounts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-200">{a.name}</p>
                      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{a.type} · {a.currency}</p>
                    </div>
                    <div className="text-right">
                      <Money minor={a.balanceMinor} currency={a.currency} className="text-base" />
                      <p className="text-[10px] text-zinc-600">demo balance</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Attention row */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border bg-card">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Follow-ups due</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">4-day purchase monitoring</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-emerald-400 hover:bg-emerald-500/10" onClick={() => onNavigate("followups")}>
                    Open centre
                  </Button>
                </div>
                <div className="mt-4 space-y-2.5">
                  {data.followUpsDue.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-xs text-zinc-500">
                      Nothing due right now. Online purchases automatically get a 4-day follow-up.
                    </p>
                  ) : (
                    data.followUpsDue.map((f) => (
                      <button key={f.id} onClick={() => onNavigate("followups")} className="flex w-full items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-left transition-colors hover:bg-amber-500/10">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-zinc-200">{f.transaction?.merchantName}{f.transaction?.orderRef ? ` · ${f.transaction.orderRef}` : ""}</p>
                          <p className="text-[11px] text-amber-400">Follow-up due — was the order received?</p>
                        </div>
                        <Money minor={f.transaction?.amountMinor ?? 0} currency={f.transaction?.currency} className="shrink-0 text-sm" />
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Alerts needing review</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Every alert explains why it fired</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-emerald-400 hover:bg-emerald-500/10" onClick={() => onNavigate("insights")}>
                    Open insights
                  </Button>
                </div>
                <div className="mt-4 max-h-56 space-y-2.5 overflow-y-auto nb-scroll">
                  {data.unreadAlerts.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-xs text-zinc-500">
                      No unread alerts. The intelligence engine watches every recorded transaction.
                    </p>
                  ) : (
                    data.unreadAlerts.map((a) => (
                      <div key={a.id} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-zinc-200">{a.title}</p>
                          <StatusBadge status={a.severity} />
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">{a.explanation}</p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent activity */}
          <Card className="border-border bg-card">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Recent activity</p>
                <Button size="sm" variant="ghost" className="text-emerald-400 hover:bg-emerald-500/10" onClick={() => onNavigate("transactions")}>
                  View all
                </Button>
              </div>
              <div className="mt-4 space-y-1">
                {data.recentTransactions.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onNavigate("transactions")}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <TxnGlyph method={t.method} credit={t.direction === "CREDIT"} />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-zinc-200">{t.merchantName}</p>
                        <p className="truncate text-[11px] text-zinc-500">
                          {t.category}{t.cardLast4 ? ` · *** ${t.cardLast4}` : ""} · {fmtDateTime(t.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {t.isDemo ? <DemoBadge className="hidden sm:inline-flex" /> : null}
                      <StatusBadge status={t.status} />
                      <Money minor={t.amountMinor} currency={t.currency} signed={t.direction === "DEBIT" ? "DEBIT" : "CREDIT"} className="w-24 text-right" />
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <EmptyState title="Nothing loaded" hint="Refresh to retry." />
      )}
    </div>
  );
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "default" | "warning" | "positive" }) {
  const cls = { default: "text-zinc-100", warning: "text-amber-400", positive: "text-emerald-400" }[tone];
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 sm:px-4">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`nb-num mt-1 text-lg font-bold ${cls}`}>{value}</p>
      {sub ? <p className="text-[10px] text-zinc-600">{sub}</p> : null}
    </div>
  );
}

export function TxnGlyph({ method, credit }: { method: string; credit: boolean }) {
  const common = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg";
  const style = credit ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-zinc-300";
  const glyph: Record<string, React.ReactNode> = {
    ONLINE: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M6 2 4 6v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4zM4 6h16M9 10a3 3 0 0 0 6 0" /></svg>,
    SUBSCRIPTION: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M21 12a9 9 0 1 1-3-6.7M21 3v5h-5" /></svg>,
    TRANSFER: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4" /></svg>,
    POS: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h4" /></svg>,
    ATM: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4M8 9h8" /></svg>,
  };
  return <div className={`${common} ${style}`} aria-hidden>{glyph[method] ?? glyph.POS}</div>;
}
