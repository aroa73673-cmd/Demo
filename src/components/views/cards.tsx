"use client";

/**
 * NEXUS BANK — Cards. Realistic card art with honest demo labelling, usage
 * against limits, permission switches, limit tuning, freeze and replacement.
 * Card numbers are never rendered in full — only the last four digits.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { PageHeader, SectionCard, StatusBadge, DemoBadge, Money, EmptyState, LoadingBlock, ErrorNote, fmtDateTime } from "@/lib/bank-ui";
import { bankApi, nestedErrorText } from "@/lib/bank-client";
import { fmtMoney, parseAmountToMinor } from "@/lib/money";
import { CardDTO } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ---------- response contracts ----------

interface CardListResponse {
  cards: CardDTO[];
}
interface CardPatchResponse {
  card: CardDTO;
}
interface CardCreateResponse {
  card: CardDTO;
}
interface ReplaceResponse {
  replacementId: string;
  reason: string;
  originalStatus: string;
}
interface CardDetailTxn {
  id: string;
  direction: "DEBIT" | "CREDIT";
  amountMinor: number;
  currency: string;
  merchantName: string;
  category: string;
  status: string;
  method: string;
  orderRef: string | null;
  createdAt: string;
}
interface CardDetailResponse {
  card: CardDTO;
  transactions: CardDetailTxn[];
}

type SwitchField = "onlineAllowed" | "contactlessAllowed" | "internationalAllowed" | "atmAllowed";
type ReplaceReason = "LOST" | "STOLEN" | "DAMAGED" | "COMPROMISED";

const REPLACE_REASONS: ReplaceReason[] = ["LOST", "STOLEN", "DAMAGED", "COMPROMISED"];

type ToastFn = (opts: { title: string; description?: string }) => void;

/** Pounds string -> minor. Shows an honest toast and returns null when invalid. */
function parseLimitField(input: string, label: string, minMinor: number, toastFn: ToastFn): number | null {
  const minor = parseAmountToMinor(input);
  if (minor === null) {
    toastFn({ title: `Invalid ${label.toLowerCase()} limit`, description: "Enter an amount in pounds, e.g. 250.00." });
    return null;
  }
  if (minor < minMinor) {
    toastFn({ title: `${label} limit is too small`, description: `Limits must be at least ${fmtMoney(minMinor)}.` });
    return null;
  }
  return minor;
}

function toPounds(minor: number): string {
  return (minor / 100).toFixed(2);
}

// ---------- main view ----------

export function CardsView() {
  const { user, accounts } = useAuth();
  const [cards, setCards] = useState<CardDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await bankApi.get<CardListResponse>("/cards");
      setCards(data.cards);
    } catch (err) {
      setError(nestedErrorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const currentAccount = accounts.find((a) => a.type === "CURRENT") ?? accounts[0] ?? null;
  const defaultHolder = (user?.name ?? "DEMO HOLDER").toUpperCase();

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Money"
        title="Cards"
        description="Freeze a card instantly, tune per-transaction, daily and monthly limits, flip payment permissions, and replace a lost or stolen card. Every control here is enforced by the policy engine on future payments."
        actions={
          <>
            <DemoBadge />
            <AddVirtualCardDialog accountId={currentAccount?.id ?? null} defaultHolder={defaultHolder} onCreated={load} />
            <Button variant="outline" size="sm" className="min-h-[44px] border-zinc-700" onClick={load} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        }
      />

      {error ? (
        <div className="flex flex-col gap-3">
          <ErrorNote message={error} />
          <div>
            <Button variant="outline" className="min-h-[44px] border-zinc-700" onClick={load}>
              Retry
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-4">
              <div className="aspect-[85.6/53.98] w-full max-w-[380px] animate-pulse rounded-xl bg-muted/50" />
              <div className="h-72 w-full animate-pulse rounded-xl bg-muted/40" />
            </div>
          ))}
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          title="No cards yet"
          hint="Use the New virtual card button above to add a demo card, then explore freeze, limits and permissions. Physical demo cards come pre-issued with the sandbox."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {cards.map((c) => (
            <CardManager key={c.id} card={c} onChanged={load} />
          ))}
        </div>
      )}

      <Card className="border-border/60 bg-card">
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-zinc-500">
            <span className="font-semibold text-zinc-300">Security note:</span> Card numbers are never stored or displayed in full. CVV/CVC is
            never collected anywhere in this product. Demo cards are not payment instruments.
          </p>
          <DemoBadge className="shrink-0" tooltip="All cards in this environment are demo records" />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- card art ----------

function CardArt({ card }: { card: CardDTO }) {
  const frozen = card.status === "FROZEN";
  return (
    <div
      className={cn(
        "nb-card-art relative flex aspect-[85.6/53.98] w-full max-w-[380px] flex-col justify-between overflow-hidden rounded-xl p-5 text-zinc-50",
        card.kind === "CREDIT" && "is-credit",
        card.kind === "VIRTUAL" && "is-virtual",
        frozen && "is-frozen",
        card.status === "REPLACED" && "opacity-60",
      )}
    >
      <DemoBadge className="absolute right-3 top-3 z-20" tooltip={`Demo card ${card.label} — not a payment instrument`} />

      {/* Top row: glyph, label, kind chip */}
      <div className="flex items-center gap-2.5 pr-16">
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-sm font-bold text-emerald-300">
          N
        </span>
        <p className="min-w-0 truncate text-sm font-semibold text-zinc-100">{card.label}</p>
        <span className="shrink-0 rounded border border-white/25 bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-200">
          {card.kind}
        </span>
      </div>

      {/* Middle: chip + contactless */}
      <div className="flex items-center justify-between gap-3">
        <ChipGlyph />
        {card.contactlessAllowed ? <ContactlessGlyph /> : null}
      </div>

      {/* Number (never full) + holder / expiry / network */}
      <div className="space-y-3">
        <p className="font-mono text-lg tracking-widest text-zinc-100">**** **** **** {card.last4}</p>
        <div className="flex items-end justify-between gap-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-widest text-zinc-500">Card holder</p>
              <p className="truncate text-xs font-medium text-zinc-200">{card.holderName}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest text-zinc-500">Expires</p>
              <p className="text-xs font-medium text-zinc-200">{expiryLabel(card)}</p>
            </div>
          </div>
          <NetworkMark network={card.network} />
        </div>
      </div>

      {/* Frozen stripe */}
      {frozen ? (
        <div className="nb-card-frozen-stripe absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/80 px-3 py-2">
            <StatusBadge status="FROZEN" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">all payments blocked</span>
          </div>
        </div>
      ) : null}

      {/* Replaced stripe */}
      {card.status === "REPLACED" ? (
        <div className="absolute inset-x-0 bottom-0 z-10 bg-background/70 px-5 py-1.5 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-300">Card replaced</span>
        </div>
      ) : null}
    </div>
  );
}

function expiryLabel(card: CardDTO): string {
  return `${String(card.expiryMonth).padStart(2, "0")}/${String(card.expiryYear).slice(-2)}`;
}

function ChipGlyph() {
  return (
    <svg viewBox="0 0 40 30" className="h-7 w-10 shrink-0" aria-hidden>
      <rect x="1" y="1" width="38" height="28" rx="5" fill="#d9a53a" stroke="#8a6d1f" strokeWidth="1" />
      <path
        d="M1 12h10M1 18h10M29 12h10M29 18h10M11 1v11M11 18v11M29 1v11M29 18v11M11 12h18v6H11z"
        fill="none"
        stroke="#8a6d1f"
        strokeWidth="1"
      />
    </svg>
  );
}

function ContactlessGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-5 w-5 shrink-0 text-zinc-300" aria-hidden>
      <path d="M8.5 9.2a5.5 5.5 0 0 1 0 5.6" />
      <path d="M11.5 7.6a8.5 8.5 0 0 1 0 8.8" />
      <path d="M14.5 6a11.5 11.5 0 0 1 0 12" />
      <path d="M17.5 4.4a14.5 14.5 0 0 1 0 15.2" />
    </svg>
  );
}

function NetworkMark({ network }: { network: CardDTO["network"] }) {
  if (network === "VISA") {
    return <span className="shrink-0 font-serif text-base font-bold italic tracking-[0.2em] text-zinc-100">VISA</span>;
  }
  return (
    <span className="flex shrink-0 items-center" aria-label="Mastercard">
      <span aria-hidden className="h-5 w-5 rounded-full bg-emerald-500 opacity-80" />
      <span aria-hidden className="-ml-2 h-5 w-5 rounded-full bg-amber-500 opacity-80" />
    </span>
  );
}

// ---------- usage against limits ----------

function UsageBar({ label, spentMinor, limitMinor }: { label: string; spentMinor: number; limitMinor: number }) {
  const pct = limitMinor > 0 ? Math.min(100, Math.round((spentMinor / limitMinor) * 100)) : 0;
  const warn = limitMinor > 0 && spentMinor / limitMinor > 0.8;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="nb-num text-zinc-300">
          {fmtMoney(spentMinor)} <span className="text-zinc-600">/ {fmtMoney(limitMinor)}</span>
        </span>
      </div>
      <Progress
        value={pct}
        aria-label={`${label} limit usage`}
        className={cn(
          "mt-1.5 h-1.5 bg-muted/50",
          warn ? "[&_[data-slot=progress-indicator]]:bg-amber-400" : "[&_[data-slot=progress-indicator]]:bg-emerald-500",
        )}
      />
    </div>
  );
}

// ---------- per-card cell ----------

function CardManager({ card, onChanged }: { card: CardDTO; onChanged: () => void }) {
  return (
    <div className="space-y-4">
      <CardArt card={card} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={card.status} />
          {card.status === "REPLACED" ? (
            <span className="text-[11px] text-zinc-500">Permanently deactivated — its replacement demo card appears in this list.</span>
          ) : null}
        </div>
        <span className="text-[11px] text-zinc-500">*** {card.last4} · {card.network}</span>
      </div>
      <SectionCard title="Usage against limits" description="Demo spend computed from stored records, compared with this card’s limits." actions={<DemoBadge />}>
        <div className="space-y-3">
          <UsageBar label="Today" spentMinor={card.spentTodayMinor ?? 0} limitMinor={card.dailyLimitMinor} />
          <UsageBar label="This month" spentMinor={card.spentThisMonthMinor ?? 0} limitMinor={card.monthlyLimitMinor} />
        </div>
      </SectionCard>
      <CardControls card={card} onChanged={onChanged} />
    </div>
  );
}

// ---------- controls panel ----------

function CardSwitchRow({
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3">
      <div className="min-w-0">
        <Label className="text-sm text-zinc-200">{label}</Label>
        <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{hint}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={label}
        className="ml-2 shrink-0 data-[state=checked]:bg-emerald-600"
      />
    </div>
  );
}

function LimitField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <Label className="text-xs text-zinc-400">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder="0.00" disabled={disabled} className="mt-1.5 min-h-[44px]" />
    </div>
  );
}

function CardControls({ card, onChanged }: { card: CardDTO; onChanged: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [busyField, setBusyField] = useState<SwitchField | null>(null);
  const [perTx, setPerTx] = useState(toPounds(card.perTxLimitMinor));
  const [daily, setDaily] = useState(toPounds(card.dailyLimitMinor));
  const [monthly, setMonthly] = useState(toPounds(card.monthlyLimitMinor));
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [reason, setReason] = useState<ReplaceReason>("LOST");

  useEffect(() => {
    setPerTx(toPounds(card.perTxLimitMinor));
    setDaily(toPounds(card.dailyLimitMinor));
    setMonthly(toPounds(card.monthlyLimitMinor));
  }, [card.perTxLimitMinor, card.dailyLimitMinor, card.monthlyLimitMinor]);

  const lifecycleLocked = card.status === "REPLACED";
  const frozen = card.status === "FROZEN";
  const switchesDisabled = lifecycleLocked || busyField !== null;

  async function patchSwitch(field: SwitchField, value: boolean) {
    setBusyField(field);
    try {
      await bankApi.patch<CardPatchResponse>(`/cards/${card.id}`, { [field]: value });
      onChanged();
    } catch (err) {
      toast({ title: "Could not update card", description: nestedErrorText(err) });
    } finally {
      setBusyField(null);
    }
  }

  async function saveLimits() {
    const perTxMinor = parseLimitField(perTx, "Per-transaction", 100, toast);
    if (perTxMinor === null) return;
    const dailyMinor = parseLimitField(daily, "Daily", 100, toast);
    if (dailyMinor === null) return;
    const monthlyMinor = parseLimitField(monthly, "Monthly", 100, toast);
    if (monthlyMinor === null) return;
    if (perTxMinor > dailyMinor || dailyMinor > monthlyMinor) {
      toast({ title: "Limit order is invalid", description: "Per-transaction must be ≤ daily, and daily ≤ monthly." });
      return;
    }
    setBusy(true);
    try {
      await bankApi.patch<CardPatchResponse>(`/cards/${card.id}`, {
        perTxLimitMinor: perTxMinor,
        dailyLimitMinor: dailyMinor,
        monthlyLimitMinor: monthlyMinor,
      });
      toast({ title: "Limits updated", description: `${card.label} (*** ${card.last4}) — new limits apply to future payments.` });
      onChanged();
    } catch (err) {
      toast({ title: "Could not save limits", description: nestedErrorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function doFreeze(nextFrozen: boolean) {
    setBusy(true);
    try {
      await bankApi.post<{ card: CardDTO }>(`/cards/${card.id}/freeze`, { frozen: nextFrozen });
      toast({
        title: nextFrozen ? "Card frozen" : "Card unfrozen",
        description: `${card.label} (*** ${card.last4}) — all new payments are ${nextFrozen ? "blocked until you unfreeze it" : "allowed again"}.`,
      });
      onChanged();
    } catch (err) {
      toast({ title: "Freeze failed", description: nestedErrorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function doReplace() {
    setBusy(true);
    try {
      const resp = await bankApi.post<ReplaceResponse>(`/cards/${card.id}/replace`, { reason });
      toast({
        title: "Replacement card issued",
        description: `${card.label} reported ${resp.reason.toLowerCase()} — permanently deactivated. A replacement demo card was issued.`,
      });
      setReplaceOpen(false);
      onChanged();
    } catch (err) {
      toast({ title: "Replacement failed", description: nestedErrorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="Card controls"
      description="Permissions and limits are enforced by the policy engine on every future payment."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <CardSwitchRow
          label="Online payments"
          hint="Card-not-present e-commerce"
          checked={card.onlineAllowed}
          disabled={switchesDisabled}
          onCheckedChange={(v) => void patchSwitch("onlineAllowed", v)}
        />
        <CardSwitchRow
          label="Contactless"
          hint="Tap-to-pay at terminals"
          checked={card.contactlessAllowed}
          disabled={switchesDisabled}
          onCheckedChange={(v) => void patchSwitch("contactlessAllowed", v)}
        />
        <CardSwitchRow
          label="International payments"
          hint="Non-GBP merchants and purchases abroad"
          checked={card.internationalAllowed}
          disabled={switchesDisabled}
          onCheckedChange={(v) => void patchSwitch("internationalAllowed", v)}
        />
        <CardSwitchRow
          label="ATM withdrawals"
          hint="Cash machines"
          checked={card.atmAllowed}
          disabled={switchesDisabled}
          onCheckedChange={(v) => void patchSwitch("atmAllowed", v)}
        />
      </div>

      <div className="mt-5 border-t border-border/60 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="nb-kicker">Limits (£)</p>
          <span className="text-[11px] text-zinc-500">Per-transaction ≤ daily ≤ monthly</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <LimitField label="Per-transaction" value={perTx} onChange={setPerTx} disabled={lifecycleLocked} />
          <LimitField label="Daily" value={daily} onChange={setDaily} disabled={lifecycleLocked} />
          <LimitField label="Monthly" value={monthly} onChange={setMonthly} disabled={lifecycleLocked} />
        </div>
        <div className="mt-3 flex flex-wrap justify-end">
          <Button onClick={() => void saveLimits()} disabled={lifecycleLocked || busy} className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-600/90">
            Save limits
          </Button>
        </div>
      </div>

      <div className="mt-5 border-t border-border/60 pt-4">
        <p className="nb-kicker">Lifecycle</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Freeze / unfreeze */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant={frozen ? "outline" : "destructive"}
                className="min-h-[44px] border-zinc-700"
                disabled={lifecycleLocked || card.status === "BLOCKED" || busy}
              >
                {frozen ? "Unfreeze card" : "Freeze card"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{frozen ? "Unfreeze this card?" : "Freeze this card?"}</AlertDialogTitle>
                <AlertDialogDescription>
                  {frozen
                    ? "Unfreezing restores the card for new transactions immediately. All your controls and limits keep applying."
                    : "Freezing blocks ALL new transactions on this card — including recurring payments and subscriptions — until you unfreeze it. Existing pending transactions are unaffected."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void doFreeze(!frozen)}
                  className={frozen ? "bg-emerald-600 text-white hover:bg-emerald-600/90" : "bg-rose-600 text-white hover:bg-rose-600/90"}
                >
                  {frozen ? "Unfreeze card" : "Freeze card"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Replace / report lost */}
          <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="min-h-[44px] border-zinc-700" disabled={lifecycleLocked || busy}>
                Replace / report lost
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Replace / report lost</DialogTitle>
                <DialogDescription>Choose why this card is being replaced. The card is permanently deactivated and a replacement demo card is issued.</DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-xs font-medium leading-relaxed text-amber-400">
                  The card is permanently deactivated and a replacement demo card is issued. This cannot be undone.
                </p>
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Reason</Label>
                <Select value={reason} onValueChange={(v) => setReason(v as ReplaceReason)}>
                  <SelectTrigger className="mt-1.5 w-full min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPLACE_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" className="min-h-[44px] border-zinc-700">
                    Cancel
                  </Button>
                </DialogClose>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="min-h-[44px]">
                      Continue
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm replacement</AlertDialogTitle>
                      <AlertDialogDescription>
                        {card.label} (*** {card.last4}) will be marked REPLACED and can never be used again. A replacement demo card is issued immediately
                        and appears in your card list.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Back</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void doReplace()} className="bg-rose-600 text-white hover:bg-rose-600/90">
                        Confirm replacement
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Card transactions */}
          <CardTxnsDialog cardId={card.id} cardLabel={card.label} last4={card.last4} />
        </div>
        {card.status === "BLOCKED" ? (
          <p className="mt-3 text-[11px] leading-relaxed text-rose-400">
            This card is blocked by the bank — freezing and replacement are unavailable until support resolves it.
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

// ---------- card transactions dialog ----------

function CardTxnsDialog({ cardId, cardLabel, last4 }: { cardId: string; cardLabel: string; last4: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [txns, setTxns] = useState<CardDetailTxn[] | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await bankApi.get<CardDetailResponse>(`/cards/${cardId}`);
      setTxns(data.transactions);
    } catch (err) {
      setError(nestedErrorText(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setTxns(null);
          void load();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-[44px] border-zinc-700">
          Transactions
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
            Card transactions <DemoBadge tooltip="Demo ledger records for this card" />
          </DialogTitle>
          <DialogDescription>
            {cardLabel} · *** {last4} — most recent demo activity.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <LoadingBlock rows={4} />
        ) : error ? (
          <div className="space-y-3">
            <ErrorNote message={error} />
            <div>
              <Button variant="outline" className="min-h-[44px] border-zinc-700" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          </div>
        ) : txns !== null && txns.length === 0 ? (
          <EmptyState title="No transactions on this card" hint="Record a purchase against it in the Shopping module to see activity here." />
        ) : txns !== null ? (
          <div className="max-h-96 space-y-2 overflow-y-auto nb-scroll pr-1">
            {txns.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-200">{t.merchantName}</p>
                  <p className="truncate text-[11px] text-zinc-500">
                    {t.category}
                    {t.orderRef ? ` · ${t.orderRef}` : ""} · {fmtDateTime(t.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={t.status} />
                  <Money minor={t.amountMinor} currency={t.currency} signed={t.direction === "DEBIT" ? "DEBIT" : "CREDIT"} className="text-sm" />
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="min-h-[44px] border-zinc-700">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- add virtual card ----------

function AddVirtualCardDialog({ accountId, defaultHolder, onCreated }: { accountId: string | null; defaultHolder: string; onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("Virtual demo card");
  const [network, setNetwork] = useState("VISA");
  const [holder, setHolder] = useState(defaultHolder);
  const [perTx, setPerTx] = useState("500.00");
  const [daily, setDaily] = useState("1000.00");
  const [monthly, setMonthly] = useState("5000.00");

  useEffect(() => {
    if (open) setHolder(defaultHolder);
  }, [open, defaultHolder]);

  async function submit() {
    if (!accountId) {
      toast({ title: "No account available", description: "A Current account is needed before a card can be added." });
      return;
    }
    if (label.trim().length < 1 || label.trim().length > 40) {
      toast({ title: "Label required", description: "Give the card a short label (1-40 characters)." });
      return;
    }
    if (holder.trim().length < 2 || holder.trim().length > 60) {
      toast({ title: "Card holder required", description: "Enter the cardholder name (2-60 characters)." });
      return;
    }
    const perTxMinor = parseLimitField(perTx, "Per-transaction", 100, toast);
    if (perTxMinor === null) return;
    const dailyMinor = parseLimitField(daily, "Daily", 100, toast);
    if (dailyMinor === null) return;
    const monthlyMinor = parseLimitField(monthly, "Monthly", 100, toast);
    if (monthlyMinor === null) return;
    if (perTxMinor > dailyMinor || dailyMinor > monthlyMinor) {
      toast({ title: "Limit order is invalid", description: "Per-transaction must be ≤ daily, and daily ≤ monthly." });
      return;
    }
    setSaving(true);
    try {
      await bankApi.post<CardCreateResponse>("/cards", {
        accountId,
        label: label.trim(),
        kind: "VIRTUAL",
        network,
        holderName: holder.trim().toUpperCase(),
        perTxLimitMinor: perTxMinor,
        dailyLimitMinor: dailyMinor,
        monthlyLimitMinor: monthlyMinor,
        onlineAllowed: true,
        contactlessAllowed: false,
        internationalAllowed: true,
        atmAllowed: false,
      });
      toast({
        title: "Virtual demo card created",
        description: "It now appears in your card list. Demo card — not a payment instrument.",
      });
      setOpen(false);
      onCreated();
    } catch (err) {
      toast({ title: "Could not create card", description: nestedErrorText(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-600/90">New virtual card</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6">New virtual card</DialogTitle>
          <DialogDescription>
            Only virtual demo cards can be created here — a real physical card can only come from a real issuer. This card is NOT a payment instrument.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-zinc-400">Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} className="mt-1.5 min-h-[44px]" placeholder="e.g. Online shopping" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Network</Label>
            <Select value={network} onValueChange={setNetwork}>
              <SelectTrigger className="mt-1.5 w-full min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VISA">VISA</SelectItem>
                <SelectItem value="MASTERCARD">MASTERCARD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-zinc-400">Card holder</Label>
            <Input value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={60} className="mt-1.5 min-h-[44px]" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Per-transaction limit (£)</Label>
            <Input value={perTx} onChange={(e) => setPerTx(e.target.value)} inputMode="decimal" className="mt-1.5 min-h-[44px]" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Daily limit (£)</Label>
            <Input value={daily} onChange={(e) => setDaily(e.target.value)} inputMode="decimal" className="mt-1.5 min-h-[44px]" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-zinc-400">Monthly limit (£)</Label>
            <Input value={monthly} onChange={(e) => setMonthly(e.target.value)} inputMode="decimal" className="mt-1.5 min-h-[44px]" />
            <p className="mt-1.5 text-[11px] text-zinc-500">Defaults 500 / 1000 / 5000. Per-transaction ≤ daily ≤ monthly.</p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="min-h-[44px] border-zinc-700">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={() => void submit()} disabled={saving} className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-600/90">
            {saving ? "Creating…" : "Create virtual card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
