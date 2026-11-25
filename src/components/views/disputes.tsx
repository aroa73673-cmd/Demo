"use client";

/**
 * NEXUS BANK — Dispute Centre. Full lifecycle tracking for genuine-issue
 * disputes. Every dispute starts because the USER confirmed a real problem;
 * NEXUS BANK never auto-reverses a completed purchase. Advancing a case is a
 * clearly-labelled demo simulation of the dispute desk progression.
 */
import { Fragment, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DemoBadge, EmptyState, ErrorNote, LoadingBlock, Money, PageHeader, SectionCard, StatusBadge, fmtDate, fmtDateTime } from "@/lib/bank-ui";
import { bankApi, nestedErrorText } from "@/lib/bank-client";
import { useToast } from "@/hooks/use-toast";
import { DisputeDTO } from "@/lib/types";

const REASON_LABELS: Record<DisputeDTO["reason"], string> = {
  UNAUTHORIZED: "Unauthorised payment",
  NOT_RECEIVED: "Order not received",
  NOT_AS_DESCRIBED: "Not as described",
  DUPLICATE: "Duplicate charge",
  OTHER: "Other",
};

const OPEN_FLOW: readonly string[] = ["SUBMITTED", "UNDER_REVIEW", "PROVISIONAL_CREDIT"];

// ---------- Small local atoms ----------

function ReasonChip({ reason }: { reason: DisputeDTO["reason"] }) {
  return (
    <span className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
      {REASON_LABELS[reason]}
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

/**
 * Compact horizontal lifecycle stepper.
 * SUBMITTED -> UNDER_REVIEW -> PROVISIONAL_CREDIT -> RESOLVED_WON / RESOLVED_LOST
 * WITHDRAWN renders as a grey terminal step.
 */
function LifecycleStepper({ status }: { status: DisputeDTO["status"] }) {
  const openIdx = OPEN_FLOW.indexOf(status); // -1 when the dispute is terminal
  const terminalLabel = openIdx >= 0 ? "RESOLVED" : status;
  const steps: string[] = [...OPEN_FLOW, terminalLabel];
  const currentIdx = openIdx >= 0 ? openIdx : steps.length - 1;

  const stepClass = (i: number): string => {
    if (i < currentIdx) return "border-emerald-500/25 bg-emerald-500/5 text-emerald-400/70";
    if (i === currentIdx) {
      if (status === "WITHDRAWN") return "border-zinc-500/50 bg-zinc-500/10 text-zinc-300";
      if (status === "RESOLVED_LOST") return "border-rose-500/60 bg-rose-500/15 text-rose-300";
      return "border-emerald-500/60 bg-emerald-500/15 text-emerald-300";
    }
    return "border-zinc-700/60 bg-muted/20 text-zinc-500";
  };

  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`Dispute lifecycle: ${status.replace(/_/g, " ").toLowerCase()}`}>
      {steps.map((s, i) => (
        <Fragment key={`${s}-${i}`}>
          {i > 0 ? <div className={cn("h-px min-w-2.5 flex-1", i <= currentIdx ? "bg-emerald-500/30" : "bg-border")} /> : null}
          <span
            className={cn(
              "rounded-full border px-2 py-1 text-center text-[9px] font-semibold uppercase tracking-wide sm:text-[10px]",
              stepClass(i),
            )}
          >
            {s.replace(/_/g, " ")}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-xs font-bold text-emerald-400">
      {n}
    </span>
  );
}

// ---------- View ----------

export function DisputesView() {
  const { toast } = useToast();
  const [data, setData] = useState<DisputeDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Advance dialog (demo simulation) + optional note
  const [advanceId, setAdvanceId] = useState<string | null>(null);
  const [advanceNote, setAdvanceNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await bankApi.get<{ disputes: DisputeDTO[] }>("/disputes");
      setData(resp.disputes);
    } catch (err) {
      setError(nestedErrorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function nextStageLabel(status: DisputeDTO["status"]): string {
    const map: Record<string, string> = {
      SUBMITTED: "UNDER REVIEW",
      UNDER_REVIEW: "PROVISIONAL CREDIT",
      PROVISIONAL_CREDIT: "RESOLVED (IN YOUR FAVOUR)",
    };
    return map[status] ?? "the next stage";
  }

  async function advanceDispute(id: string) {
    setAdvanceId(null);
    setBusy(`advance-${id}`);
    try {
      await bankApi.post(`/disputes/${id}/advance`, { note: advanceNote.trim() || undefined });
      toast({
        title: "Case advanced (demo simulation)",
        description: "The dispute desk timeline was updated. In production this progression is driven by the dispute team and payment network.",
      });
      await load();
    } catch (err) {
      toast({ title: "Could not advance the case", description: nestedErrorText(err) });
    } finally {
      setBusy(null);
      setAdvanceNote("");
    }
  }

  async function withdrawDispute(id: string) {
    setBusy(`withdraw-${id}`);
    try {
      await bankApi.post(`/disputes/${id}/withdraw`, {});
      toast({
        title: "Dispute withdrawn",
        description: "The case closed as WITHDRAWN. If the transaction was marked DISPUTED it returned to COMPLETED.",
      });
      await load();
    } catch (err) {
      toast({ title: "Could not withdraw the dispute", description: nestedErrorText(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Protection"
        title="Dispute Centre"
        description="Lifecycle tracking for disputes you opened on genuine issues. Advancing a case here is a labelled demo simulation — nothing is reversed automatically."
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

      {/* Education */}
      <SectionCard
        title="The legitimate dispute process"
        description="What actually happens when a card dispute is raised — and what this demo does and does not simulate."
      >
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
            <StepNumber n={1} />
            <p className="text-xs leading-relaxed text-zinc-300">Contact the merchant first and give them a fair chance to resolve it.</p>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
            <StepNumber n={2} />
            <p className="text-xs leading-relaxed text-zinc-300">Submit the dispute with your statement and keep your evidence (receipts, tracking, photos).</p>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
            <StepNumber n={3} />
            <p className="text-xs leading-relaxed text-zinc-300">The dispute desk reviews the case and asks the merchant to respond with its own evidence.</p>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
            <StepNumber n={4} />
            <p className="text-xs leading-relaxed text-zinc-300">
              Provisional credit may appear while the investigation continues — it is not a final decision.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
            <StepNumber n={5} />
            <p className="text-xs leading-relaxed text-zinc-300">A final resolution follows: in your favour, against you, or withdrawn at your request.</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Typical real-world timelines: merchant responses 1–2 weeks; provisional credit 10–20 business days where the network allows; final
          investigation outcome commonly 30–90 days, scheme-dependent.
        </p>
        <p className="mt-2 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs leading-relaxed text-amber-400">
          Improper disputes against legitimate purchases may constitute abuse — real institutions can close accounts over it. Dispute only
          what you genuinely believe is wrong.
        </p>
        <p className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-xs font-medium leading-relaxed text-emerald-300">
          NEXUS BANK never auto-reverses a completed purchase. Every dispute here starts because YOU confirmed a genuine issue.
        </p>
      </SectionCard>

      {loading ? (
        <LoadingBlock rows={4} />
      ) : error ? (
        <EmptyState title="Could not load disputes" hint="Refresh to retry." />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No disputes on file"
          hint="Open a dispute from a transaction detail view when you have a genuine issue. Nothing here is auto-created and no purchase is ever reversed automatically."
        />
      ) : (
        <div className="space-y-4">
          {data.map((d) => {
            const open = OPEN_FLOW.includes(d.status);
            const t = d.transaction;
            return (
              <Card key={d.id} className="border-border bg-card">
                <CardContent className="space-y-4 p-4 sm:p-5">
                  {/* Card header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ReasonChip reason={d.reason} />
                      <StatusBadge status={d.status} />
                      {t?.isDemo ? <DemoBadge /> : null}
                    </div>
                    <span className="text-[11px] text-zinc-500">
                      opened {fmtDate(d.createdAt)} · updated {fmtDate(d.updatedAt)}
                    </span>
                  </div>

                  {/* Transaction info */}
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{t?.merchantName ?? "Unknown merchant"}</p>
                          {t?.orderRef ? <OrderRefChip value={t.orderRef} /> : null}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t ? `${t.category} · ${t.method} · ${fmtDate(t.createdAt)}` : "Transaction details unavailable"}
                        </p>
                      </div>
                      {t ? (
                        <Money
                          minor={t.amountMinor}
                          currency={t.currency}
                          signed={t.direction === "DEBIT" ? "DEBIT" : "CREDIT"}
                          className="text-sm"
                        />
                      ) : null}
                    </div>
                  </div>

                  {/* Statement */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Your statement</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">{d.description}</p>
                  </div>

                  {/* Lifecycle */}
                  <LifecycleStepper status={d.status} />

                  {/* Timeline */}
                  <div>
                    <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">Case timeline ({d.timeline.length} entries)</p>
                    {d.timeline.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-center text-xs text-zinc-500">
                        No timeline entries recorded.
                      </p>
                    ) : (
                      <div className="max-h-64 space-y-3 overflow-y-auto nb-scroll rounded-lg border border-border/70 bg-muted/20 p-3">
                        {d.timeline.map((e, i) => (
                          <div key={`${e.at}-${e.event}-${i}`}>
                            <div className="flex flex-wrap items-center gap-2">
                              <EventChip event={e.event} />
                              <span className="text-[11px] text-muted-foreground">{fmtDateTime(e.at)}</span>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-zinc-300">{e.detail}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {open ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="min-h-[44px] flex-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 sm:flex-none sm:px-6"
                        disabled={busy !== null}
                        onClick={() => {
                          setAdvanceNote("");
                          setAdvanceId(d.id);
                        }}
                      >
                        Advance case (demo simulation)
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            className="min-h-[44px] flex-1 border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 sm:flex-none sm:px-6"
                            disabled={busy !== null}
                          >
                            {busy === `withdraw-${d.id}` ? "Withdrawing…" : "Withdraw dispute"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Withdraw this dispute?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The case closes as WITHDRAWN and the timeline records your decision. If the transaction was marked DISPUTED it
                              returns to COMPLETED. This does not request a refund — you can still request one separately from the
                              transaction view.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="min-h-[44px]">Keep the case open</AlertDialogCancel>
                            <AlertDialogAction
                              className="min-h-[44px] border border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
                              onClick={() => void withdrawDispute(d.id)}
                            >
                              Withdraw dispute
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-center text-xs text-zinc-500">
                      This case is closed ({d.status.replace(/_/g, " ").toLowerCase()}). Open disputes show their lifecycle actions here.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Advance dialog (demo simulation) */}
      <Dialog
        open={advanceId !== null}
        onOpenChange={(o) => {
          if (!o) setAdvanceId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Advance case (demo simulation)</DialogTitle>
            <DialogDescription>
              This demo simulates the dispute desk progression — in production this is driven by the dispute team and payment network. The
              case moves to {advanceId ? nextStageLabel(data?.find((x) => x.id === advanceId)?.status ?? "SUBMITTED") : "the next stage"}{" "}
              and the timeline records the step.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="advance-note">Desk note (optional)</Label>
              <Input
                id="advance-note"
                value={advanceNote}
                onChange={(e) => setAdvanceNote(e.target.value)}
                placeholder="e.g. merchant tracking provided, matches the statement"
                maxLength={500}
              />
            </div>
            <Button
              variant="outline"
              className="min-h-[44px] w-full border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
              disabled={busy !== null || advanceId === null}
              onClick={() => advanceId && void advanceDispute(advanceId)}
            >
              {busy?.startsWith("advance-") ? "Advancing…" : "Advance case"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
