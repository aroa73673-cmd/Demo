"use client";

/**
 * NEXUS BANK — Transaction explorer: search, filters, sort, pagination and a
 * full detail dialog (timeline, refunds, disputes, alerts, receipts).
 * Honesty contract: refunds and settlement states are USER DECLARATIONS made
 * inside the demo environment — every action here is labelled as such.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  DemoBadge,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  Money,
  PageHeader,
  SeverityBadge,
  StatusBadge,
  fmtDate,
  fmtDateTime,
} from "@/lib/bank-ui";
import { bankApi, nestedErrorText } from "@/lib/bank-client";
import { fmtMoney, parseAmountToMinor } from "@/lib/money";
import { useToast } from "@/hooks/use-toast";
import { CATEGORIES, TXN_METHODS, TXN_STATUSES } from "@/lib/validation";
import { CardDTO, DisputeDTO, TransactionDTO, TransactionDetailDTO } from "@/lib/types";
import { TxnGlyph } from "@/components/views/dashboard";

const PAGE_SIZE = 15;

const REASON_LABELS: Record<DisputeDTO["reason"], string> = {
  UNAUTHORIZED: "Unauthorised payment",
  NOT_RECEIVED: "Order not received",
  NOT_AS_DESCRIBED: "Not as described",
  DUPLICATE: "Duplicate charge",
  OTHER: "Other",
};

const REFUNDABLE_STATUSES: readonly string[] = ["COMPLETED", "PARTIALLY_REFUNDED", "PENDING"];
const DISPUTABLE_STATUSES: readonly string[] = ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"];
const OPEN_DISPUTE_STATUSES: readonly string[] = ["SUBMITTED", "UNDER_REVIEW", "PROVISIONAL_CREDIT"];

interface TxnListResponse {
  transactions: TransactionDTO[];
  total: number;
  page: number;
  pages: number;
}

// ---------- Small local atoms ----------

function InfoChip({ tone, children }: { tone: "sky" | "amber" | "violet"; children: React.ReactNode }) {
  const style = {
    sky: "border-sky-500/40 bg-sky-500/10 text-sky-400",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    violet: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", style)}>
      {children}
    </span>
  );
}

function OrderRefChip({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
      {value}
    </span>
  );
}

function EventChip({ event }: { event: string }) {
  return (
    <span className="inline-flex items-center rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-400">
      {event}
    </span>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <div className="mt-1 text-xs text-zinc-200">{children}</div>
    </div>
  );
}

function SectionHeading({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {actions}
    </div>
  );
}

function TimelineList({ events }: { events: { at: string; event: string; detail: string }[] }) {
  if (events.length === 0) {
    return <p className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-center text-xs text-zinc-500">No timeline events.</p>;
  }
  return (
    <ol className="relative space-y-4 border-l border-border/70 pl-5">
      {events.map((e, i) => (
        <li key={`${e.at}-${e.event}-${i}`} className="relative">
          <span
            aria-hidden
            className={cn(
              "absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border",
              i === events.length - 1 ? "border-emerald-500/60 bg-emerald-500/40" : "border-zinc-600 bg-zinc-700",
            )}
          />
          <div className="flex flex-wrap items-center gap-2">
            <EventChip event={e.event} />
            <span className="text-[11px] text-muted-foreground">{fmtDateTime(e.at)}</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-300">{e.detail}</p>
        </li>
      ))}
    </ol>
  );
}

// ---------- View ----------

export function TransactionsView() {
  const { toast } = useToast();

  // Filters (client state; every change resets pagination)
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [method, setMethod] = useState("all");
  const [category, setCategory] = useState("all");
  const [cardId, setCardId] = useState("all");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const [cards, setCards] = useState<CardDTO[]>([]);

  const [data, setData] = useState<TxnListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Detail dialog
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TransactionDetailDTO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Refund flow
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [refundError, setRefundError] = useState("");
  const [confirmRefundId, setConfirmRefundId] = useState<string | null>(null);
  const [providerRef, setProviderRef] = useState("");

  // Dispute flow
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState<DisputeDTO["reason"]>("NOT_RECEIVED");
  const [disputeText, setDisputeText] = useState("");
  const [disputeConfirm, setDisputeConfirm] = useState(false);
  const [disputeError, setDisputeError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status !== "all") params.set("status", status);
      if (method !== "all") params.set("method", method);
      if (category !== "all") params.set("category", category);
      if (cardId !== "all") params.set("cardId", cardId);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      // Backend contract (see /api/bank/transactions): only "oldest" maps to
      // ascending order; every other value sorts desc.
      params.set("sort", sort === "asc" ? "oldest" : "desc");
      setData(await bankApi.get<TxnListResponse>(`/transactions?${params.toString()}`));
    } catch (err) {
      setError(nestedErrorText(err));
    } finally {
      setLoading(false);
    }
  }, [q, status, method, category, cardId, sort, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Card options for the card filter (loaded once; failure just leaves "All cards").
  useEffect(() => {
    bankApi
      .get<{ cards: CardDTO[] }>("/cards")
      .then((d) => setCards(d.cards))
      .catch(() => undefined);
  }, []);

  // Debounced search commit — committing a new query resets pagination.
  const qCommitted = useRef("");
  useEffect(() => {
    const t = setTimeout(() => {
      const next = qInput.trim();
      if (next !== qCommitted.current) {
        qCommitted.current = next;
        setQ(next);
        setPage(1);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [qInput]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError("");
    try {
      const resp = await bankApi.get<{ transaction: TransactionDetailDTO }>(`/transactions/${id}`);
      setDetail(resp.transaction);
    } catch (err) {
      setDetailError(nestedErrorText(err));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      setRefundOpen(false);
      setDisputeOpen(false);
      setConfirmRefundId(null);
      return;
    }
    void loadDetail(openId);
  }, [openId, loadDetail]);

  const hasFilters = qInput.trim() !== "" || status !== "all" || method !== "all" || category !== "all" || cardId !== "all" || sort !== "desc";

  function resetFilters() {
    setQInput("");
    setStatus("all");
    setMethod("all");
    setCategory("all");
    setCardId("all");
    setSort("desc");
    setPage(1);
  }

  // ----- detail actions -----

  function remainingMinor(t: TransactionDetailDTO): number {
    return t.amountMinor - t.refundedMinor;
  }

  function openRefundDialog() {
    if (!detail) return;
    setRefundAmount((remainingMinor(detail) / 100).toFixed(2));
    setRefundNote("");
    setRefundError("");
    setRefundOpen(true);
  }

  async function submitRefund() {
    if (!detail) return;
    const remaining = remainingMinor(detail);
    const minor = parseAmountToMinor(refundAmount);
    if (minor === null) {
      setRefundError("Enter a valid amount in pounds, e.g. 12.50");
      return;
    }
    if (minor <= 0) {
      setRefundError("The refund amount must be greater than zero.");
      return;
    }
    if (minor > remaining) {
      setRefundError(`The refund cannot exceed the remaining ${fmtMoney(remaining, detail.currency)}.`);
      return;
    }
    setBusy("refund");
    try {
      await bankApi.post(`/transactions/${detail.id}/refund`, { amountMinor: minor, note: refundNote.trim() || undefined });
      toast({
        title: "Refund request recorded (REQUESTED)",
        description: "Nothing moves automatically — you declare the merchant's confirmation in a separate step.",
      });
      setRefundOpen(false);
      await Promise.all([loadDetail(detail.id), load()]);
    } catch (err) {
      toast({ title: "Refund request failed", description: nestedErrorText(err) });
    } finally {
      setBusy(null);
    }
  }

  async function resolveRefund(refundId: string, next: "CONFIRMED" | "DECLINED" | "CANCELLED") {
    if (!detail) return;
    setBusy(`refund-${refundId}-${next}`);
    try {
      await bankApi.patch(`/transactions/${detail.id}/refund`, {
        refundId,
        status: next,
        ...(next === "CONFIRMED" && providerRef.trim() ? { providerRef: providerRef.trim() } : {}),
      });
      toast({
        title:
          next === "CONFIRMED"
            ? "Refund confirmed — recorded as YOUR declaration"
            : `Refund request ${next.toLowerCase()} (your declaration)`,
        description: "The ledger now reflects what you declared. Nothing is automatically confirmed.",
      });
      setConfirmRefundId(null);
      setProviderRef("");
      await Promise.all([loadDetail(detail.id), load()]);
    } catch (err) {
      toast({ title: "Could not update the refund", description: nestedErrorText(err) });
    } finally {
      setBusy(null);
    }
  }

  async function markStatus(next: "COMPLETED" | "DECLINED") {
    if (!detail) return;
    setBusy(`status-${next}`);
    try {
      await bankApi.post(`/transactions/${detail.id}/status`, { status: next });
      toast({
        title: next === "COMPLETED" ? "Marked completed (demo declaration)" : "Marked declined (demo declaration)",
        description: "You declared the settlement state of this demo purchase. No payment provider was contacted.",
      });
      await Promise.all([loadDetail(detail.id), load()]);
    } catch (err) {
      toast({ title: "Could not update the status", description: nestedErrorText(err) });
    } finally {
      setBusy(null);
    }
  }

  function openDisputeDialog() {
    setDisputeReason("NOT_RECEIVED");
    setDisputeText("");
    setDisputeConfirm(false);
    setDisputeError("");
    setDisputeOpen(true);
  }

  async function submitDispute() {
    if (!detail) return;
    const len = disputeText.trim().length;
    if (len < 20) {
      setDisputeError(`Describe the issue in at least 20 characters so the dispute team can act (${len}/20).`);
      return;
    }
    if (!disputeConfirm) {
      setDisputeError("You must confirm the dispute is genuine before it can be submitted.");
      return;
    }
    setBusy("dispute");
    try {
      await bankApi.post(`/transactions/${detail.id}/dispute`, {
        reason: disputeReason,
        description: disputeText.trim(),
        confirmGenuine: true,
      });
      toast({
        title: "Dispute submitted (SUBMITTED)",
        description: "Follow its lifecycle in the Dispute Centre. Nothing is reversed automatically.",
      });
      setDisputeOpen(false);
      await Promise.all([loadDetail(detail.id), load()]);
    } catch (err) {
      toast({ title: "Could not submit the dispute", description: nestedErrorText(err) });
    } finally {
      setBusy(null);
    }
  }

  const refundable = detail ? detail.direction === "DEBIT" && REFUNDABLE_STATUSES.includes(detail.status) : false;
  const canOpenDispute = detail
    ? detail.direction === "DEBIT" &&
      DISPUTABLE_STATUSES.includes(detail.status) &&
      detail.disputes.every((d) => !OPEN_DISPUTE_STATUSES.includes(d.status))
    : false;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Money"
        title="Transactions"
        description="Search, filter and inspect every movement. All records were created inside this demo sandbox — receipts, refunds and disputes are honest artefacts, not real bank outputs."
        actions={
          <>
            <DemoBadge />
            <Button variant="outline" className="min-h-[44px] border-zinc-700" onClick={() => void load()} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        }
      />

      <ErrorNote message={error} />

      {/* Filter bar */}
      <Card className="border-border bg-card">
        <CardContent className="flex flex-wrap items-center gap-2 p-4 sm:gap-3">
          <Input
            type="text"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Merchant, order ref, description…"
            aria-label="Search transactions"
            className="h-11 w-full sm:min-w-[220px] sm:max-w-xs sm:flex-1"
          />
          <Select
            value={status}
            onValueChange={(v) => {
              setPage(1);
              setStatus(v);
            }}
          >
            <SelectTrigger aria-label="Filter by status" className="h-11 w-full sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {TXN_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={method}
            onValueChange={(v) => {
              setPage(1);
              setMethod(v);
            }}
          >
            <SelectTrigger aria-label="Filter by method" className="h-11 w-full sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              {TXN_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={category}
            onValueChange={(v) => {
              setPage(1);
              setCategory(v);
            }}
          >
            <SelectTrigger aria-label="Filter by category" className="h-11 w-full sm:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72 nb-scroll">
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={cardId}
            onValueChange={(v) => {
              setPage(1);
              setCardId(v);
            }}
          >
            <SelectTrigger aria-label="Filter by card" className="h-11 w-full sm:w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72 nb-scroll">
              <SelectItem value="all">All cards</SelectItem>
              {cards.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label} · *** {c.last4}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(v) => {
              setPage(1);
              setSort(v === "asc" ? "asc" : "desc");
            }}
          >
            <SelectTrigger aria-label="Sort order" className="h-11 w-full sm:w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Newest</SelectItem>
              <SelectItem value="asc">Oldest</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters ? (
            <Button variant="ghost" className="min-h-[44px] text-muted-foreground" onClick={resetFilters}>
              Reset filters
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <LoadingBlock rows={6} />
      ) : !data ? (
        <EmptyState title="Nothing loaded" hint="Adjust the filters and refresh to retry." />
      ) : data.transactions.length === 0 ? (
        <EmptyState
          title="No transactions match"
          hint="Try different filters or search terms. Purchases recorded in Shopping & Purchases appear here automatically."
        />
      ) : (
        <Card className="border-border bg-card">
          <CardContent className="p-3 sm:p-4">
            <div className="space-y-1">
              {data.transactions.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setOpenId(t.id)}
                  className="flex min-h-[44px] w-full flex-col gap-2 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <TxnGlyph method={t.method} credit={t.direction === "CREDIT"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm text-zinc-200">{t.merchantName}</p>
                        {t.orderRef ? <OrderRefChip value={t.orderRef} /> : null}
                      </div>
                      <p className="truncate text-[11px] text-zinc-500">
                        {t.category}
                        {t.cardLabel ? ` · ${t.cardLabel} *** ${t.cardLast4}` : ""} · {fmtDateTime(t.createdAt)}
                      </p>
                    </div>
                    <Money
                      minor={t.amountMinor}
                      currency={t.currency}
                      signed={t.direction === "DEBIT" ? "DEBIT" : "CREDIT"}
                      className="shrink-0 text-sm sm:hidden"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    {t.refundedMinor > 0 ? <InfoChip tone="sky">refunded {fmtMoney(t.refundedMinor, t.currency)}</InfoChip> : null}
                    {t.hasFollowUp ? <InfoChip tone="amber">follow-up pending</InfoChip> : null}
                    {t.disputeStatus ? (
                      <InfoChip tone="violet">dispute {t.disputeStatus.toLowerCase().replace(/_/g, " ")}</InfoChip>
                    ) : null}
                    {t.isDemo ? <DemoBadge className="hidden sm:inline-flex" /> : null}
                    <StatusBadge status={t.status} />
                    <Money
                      minor={t.amountMinor}
                      currency={t.currency}
                      signed={t.direction === "DEBIT" ? "DEBIT" : "CREDIT"}
                      className="hidden w-24 text-right text-sm sm:block"
                    />
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                page {data.page} of {data.pages} · {data.total} records
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="min-h-[44px] border-zinc-700"
                  disabled={data.page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px] border-zinc-700"
                  disabled={data.page >= data.pages || loading}
                  onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail dialog */}
      <Dialog
        open={openId !== null}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto nb-scroll sm:max-w-2xl">
          {detailLoading ? <DialogTitle className="sr-only">Transaction detail (loading)</DialogTitle> : null}
          {detailLoading ? <LoadingBlock rows={6} /> : null}
          {detailError && !detailLoading ? (
            <div className="space-y-3">
              <ErrorNote message={detailError} />
              <Button variant="outline" className="min-h-[44px] border-zinc-700" onClick={() => openId && void loadDetail(openId)}>
                Retry
              </Button>
            </div>
          ) : null}

          {detail && !detailLoading ? (
            <div className="space-y-5">
              {/* Header */}
              <div>
                <p className="nb-kicker">Transaction detail</p>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <DialogTitle asChild>
                      <h3 className="text-lg font-semibold tracking-tight text-foreground">{detail.merchantName}</h3>
                    </DialogTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {detail.category}
                      {detail.merchantCategory ? ` · ${detail.merchantCategory}` : ""} · {detail.method}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={detail.status} />
                      {detail.isDemo ? <DemoBadge /> : null}
                      {detail.orderRef ? <OrderRefChip value={detail.orderRef} /> : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <Money
                      minor={detail.amountMinor}
                      currency={detail.currency}
                      signed={detail.direction === "DEBIT" ? "DEBIT" : "CREDIT"}
                      className="text-xl"
                    />
                    {detail.refundedMinor > 0 ? (
                      <p className="mt-1 text-[11px] text-sky-400">refunded {fmtMoney(detail.refundedMinor, detail.currency)}</p>
                    ) : null}
                  </div>
                </div>
                {detail.description ? <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{detail.description}</p> : null}
              </div>

              {/* Receipt actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="min-h-[44px] border-zinc-700"
                  onClick={() => window.open(`/api/bank/receipts/${detail.id}?format=html`, "_blank")}
                >
                  Receipt (HTML)
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px] border-zinc-700"
                  onClick={() => window.open(`/api/bank/receipts/${detail.id}?format=json`, "_blank")}
                >
                  JSON
                </Button>
              </div>

              {/* Meta grid */}
              <div className="grid gap-2 sm:grid-cols-2">
                <MetaRow label="Account">{detail.accountName ?? "—"}</MetaRow>
                <MetaRow label="Card">{detail.cardLabel ? `${detail.cardLabel} · *** ${detail.cardLast4}` : "—"}</MetaRow>
                <MetaRow label="Recorded">{fmtDateTime(detail.createdAt)}</MetaRow>
                <MetaRow label="Posted">{fmtDateTime(detail.postedAt)}</MetaRow>
                <MetaRow label="Order reference">
                  {detail.orderRef ? <span className="font-mono">{detail.orderRef}</span> : "—"}
                </MetaRow>
                <MetaRow label="Refunded so far">{fmtMoney(detail.refundedMinor, detail.currency)}</MetaRow>
              </div>

              {/* PENDING settlement declaration */}
              {detail.status === "PENDING" ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-xs font-semibold text-amber-400">Pending settlement — declare the outcome</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    You declare the settlement state of demo purchases — no payment provider is contacted and nothing is confirmed externally.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="min-h-[44px] flex-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                      disabled={busy !== null}
                      onClick={() => void markStatus("COMPLETED")}
                    >
                      {busy === "status-COMPLETED" ? "Recording…" : "Mark confirmed (demo)"}
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-[44px] flex-1 border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
                      disabled={busy !== null}
                      onClick={() => void markStatus("DECLINED")}
                    >
                      {busy === "status-DECLINED" ? "Recording…" : "Mark declined (demo)"}
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* Timeline */}
              <section className="space-y-3">
                <SectionHeading title="Timeline (oldest first)" />
                <TimelineList events={detail.timeline} />
              </section>

              {/* Refunds */}
              <section className="space-y-3">
                <SectionHeading
                  title="Refunds"
                  actions={
                    refundable ? (
                      <Button variant="outline" size="sm" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300" onClick={openRefundDialog}>
                        Request refund
                      </Button>
                    ) : null
                  }
                />
                {detail.refunds.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-center text-xs text-zinc-500">
                    {refundable
                      ? "No refunds recorded for this transaction yet."
                      : "No refunds recorded. Refunds apply to outgoing payments in COMPLETED, PARTIALLY_REFUNDED or PENDING state."}
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {detail.refunds.map((r) => (
                      <div key={r.id} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={r.status} />
                            <Money minor={r.amountMinor} currency={detail.currency} className="text-sm" />
                          </div>
                          <span className="text-[11px] text-zinc-500">requested {fmtDate(r.createdAt)}</span>
                        </div>
                        {r.providerRef ? (
                          <p className="mt-1.5 text-[11px] text-zinc-400">
                            provider ref: <span className="font-mono">{r.providerRef}</span>
                          </p>
                        ) : null}
                        {r.note ? <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{r.note}</p> : null}
                        {r.resolvedAt ? <p className="mt-1 text-[10px] text-zinc-600">resolved {fmtDate(r.resolvedAt)}</p> : null}
                        {r.status === "REQUESTED" ? (
                          <div className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                                disabled={busy !== null}
                                onClick={() => {
                                  setProviderRef("");
                                  setConfirmRefundId(r.id);
                                }}
                              >
                                Merchant confirmed refund
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
                                disabled={busy !== null}
                                onClick={() => void resolveRefund(r.id, "DECLINED")}
                              >
                                Refund declined
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-zinc-700 text-zinc-400 hover:text-zinc-200"
                                disabled={busy !== null}
                                onClick={() => void resolveRefund(r.id, "CANCELLED")}
                              >
                                Cancel request
                              </Button>
                            </div>
                            <p className="mt-2 text-[11px] italic leading-relaxed text-muted-foreground">
                              You declare that the merchant/provider confirmed this refund — nothing is automatically confirmed.
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Disputes */}
              <section className="space-y-3">
                <SectionHeading
                  title="Disputes"
                  actions={
                    canOpenDispute ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-violet-500/40 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300"
                        onClick={openDisputeDialog}
                      >
                        Open dispute
                      </Button>
                    ) : null
                  }
                />
                {detail.disputes.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-center text-xs text-zinc-500">
                    {canOpenDispute
                      ? "No disputes on this transaction. Only open one for a genuine issue — the merchant should be contacted first."
                      : "No disputes on this transaction. Disputes apply to outgoing payments that are completed, partially refunded or refunded."}
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {detail.disputes.map((d) => (
                      <div key={d.id} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                              {REASON_LABELS[d.reason]}
                            </span>
                            <StatusBadge status={d.status} />
                          </div>
                          <span className="text-[11px] text-zinc-500">opened {fmtDate(d.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-zinc-300">{d.description}</p>
                        <p className="mt-1.5 text-[11px] text-zinc-500">{d.timeline.length} timeline events</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Alerts */}
              <section className="space-y-3">
                <SectionHeading title="Related alerts" />
                {detail.alerts.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-center text-xs text-zinc-500">
                    No alerts were raised for this transaction.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {detail.alerts.map((a) => (
                      <div key={a.id} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-zinc-200">{a.title}</p>
                          <SeverityBadge severity={a.severity} />
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{a.explanation}</p>
                        <p className="mt-1.5 text-[10px] text-zinc-600">{fmtDateTime(a.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Request refund dialog */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request a refund</DialogTitle>
            <DialogDescription>
              Records YOUR refund claim on this transaction. The merchant&apos;s confirmation is a separate, explicit step — nothing is
              requested from a real provider.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="refund-amount">Amount (pounds)</Label>
              <Input
                id="refund-amount"
                inputMode="decimal"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="e.g. 49.99"
                maxLength={12}
              />
              <p className="text-[11px] text-muted-foreground">
                Remaining refundable: {detail ? fmtMoney(remainingMinor(detail), detail.currency) : "—"}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-note">Note (optional)</Label>
              <Input
                id="refund-note"
                value={refundNote}
                onChange={(e) => setRefundNote(e.target.value)}
                placeholder="e.g. merchant support offered a full refund"
                maxLength={300}
              />
            </div>
            <ErrorNote message={refundError} />
            <Button
              className="min-h-[44px] w-full border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void submitRefund()}
            >
              {busy === "refund" ? "Recording…" : "Submit refund request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Declare merchant confirmation dialog */}
      <Dialog
        open={confirmRefundId !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmRefundId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Declare merchant confirmation</DialogTitle>
            <DialogDescription>
              Only use this if the merchant or provider has ACTUALLY confirmed the refund to you. Your declaration updates the ledger —
              nothing is automatically confirmed and no provider was contacted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="provider-ref">Provider reference (optional)</Label>
              <Input
                id="provider-ref"
                value={providerRef}
                onChange={(e) => setProviderRef(e.target.value)}
                placeholder="e.g. RF-2027-000123"
                maxLength={60}
              />
            </div>
            <Button
              className="min-h-[44px] w-full border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
              variant="outline"
              disabled={busy !== null || confirmRefundId === null}
              onClick={() => confirmRefundId && void resolveRefund(confirmRefundId, "CONFIRMED")}
            >
              {busy === `refund-${confirmRefundId}-CONFIRMED` ? "Recording…" : "Declare confirmed"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Open dispute dialog */}
      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto nb-scroll sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Open a dispute</DialogTitle>
            <DialogDescription>
              A dispute is a formal case, not a refund button. It is reviewed by the dispute desk and the merchant is asked to respond.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="text-xs font-semibold text-foreground">How a real dispute works</p>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <li>1. Contact the merchant first — most issues resolve faster than a dispute ever would.</li>
                <li>2. Your statement is submitted to the dispute team, which asks the merchant for evidence (tracking, invoices, correspondence).</li>
                <li>3. Provisional credit may be applied while the investigation continues — it is not a final decision.</li>
                <li>4. Final outcomes typically take 30–90 days depending on the payment network.</li>
                <li>5. Nothing is auto-reversed: NEXUS BANK never reverses a completed purchase automatically.</li>
              </ul>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dispute-reason">Reason</Label>
              <Select value={disputeReason} onValueChange={(v) => setDisputeReason(v as DisputeDTO["reason"])}>
                <SelectTrigger id="dispute-reason" className="h-11 w-full" aria-label="Dispute reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="nb-scroll">
                  {(Object.keys(REASON_LABELS) as DisputeDTO["reason"][]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {REASON_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="dispute-description">What happened?</Label>
                <span className="text-[10px] text-muted-foreground">{disputeText.trim().length}/20 minimum</span>
              </div>
              <Textarea
                id="dispute-description"
                value={disputeText}
                onChange={(e) => setDisputeText(e.target.value)}
                placeholder="Include dates, order references and what the merchant said when you contacted them…"
                maxLength={2000}
                className="min-h-24"
              />
            </div>
            <label
              htmlFor="dispute-genuine"
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
            >
              <Checkbox
                id="dispute-genuine"
                checked={disputeConfirm}
                onCheckedChange={(v) => setDisputeConfirm(v === true)}
                className="mt-0.5"
              />
              <span className="text-[11px] font-medium leading-relaxed text-amber-200/90">
                I confirm this dispute is genuine and I understand improper disputes against legitimate purchases may constitute abuse.
              </span>
            </label>
            <ErrorNote message={disputeError} />
            <Button
              className="min-h-[44px] w-full border-violet-500/40 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void submitDispute()}
            >
              {busy === "dispute" ? "Submitting…" : "Submit dispute"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
