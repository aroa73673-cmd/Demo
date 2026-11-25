"use client";

/**
 * NEXUS BANK — Shopping & Purchases. Record purchases through the policy
 * engine, manage merchant rules, and browse purchases with receipts and
 * month-to-date analytics. All amounts are minor units in API calls.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, SectionCard, StatusBadge, DemoBadge, Money, EmptyState, LoadingBlock, ErrorNote, fmtDate, fmtDateTime } from "@/lib/bank-ui";
import { bankApi, nestedErrorText } from "@/lib/bank-client";
import { fmtMoney, parseAmountToMinor } from "@/lib/money";
import { CATEGORIES, TXN_METHODS, TXN_STATUSES } from "@/lib/validation";
import { CardDTO, InsightSummary, MerchantRuleDTO, RecordPurchaseResponse, TransactionDTO } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ---------- response contracts ----------

interface TxnListResponse {
  transactions: TransactionDTO[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}
interface MerchantRulesResponse {
  rules: MerchantRuleDTO[];
}

type ToastFn = (opts: { title: string; description?: string }) => void;

/** Static Tailwind width buckets so bar widths never need inline styles. */
const BAR_WIDTHS: string[] = [
  "w-0", "w-[5%]", "w-[10%]", "w-[15%]", "w-[20%]", "w-[25%]", "w-[30%]", "w-[35%]", "w-[40%]", "w-[45%]",
  "w-[50%]", "w-[55%]", "w-[60%]", "w-[65%]", "w-[70%]", "w-[75%]", "w-[80%]", "w-[85%]", "w-[90%]", "w-[95%]",
  "w-full",
];

function barWidthClass(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  return BAR_WIDTHS[Math.round(clamped / 5)];
}

// ---------- main view ----------

export function ShoppingView() {
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Money"
        title="Shopping & Purchases"
        description="Record purchases exactly as they happen: the policy engine evaluates every payment first, approved online orders get a 4-day follow-up, and merchant rules shape future spending."
        actions={<DemoBadge />}
      />
      <Tabs defaultValue="record" className="gap-6">
        <TabsList className="h-auto max-w-2xl w-full flex-wrap">
          <TabsTrigger value="record">Record purchase</TabsTrigger>
          <TabsTrigger value="rules">Merchant rules</TabsTrigger>
          <TabsTrigger value="history">Purchases & analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="record" className="mt-4">
          <RecordPurchaseForm />
        </TabsContent>
        <TabsContent value="rules" className="mt-4">
          <MerchantRules />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <PurchasesAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- chips ----------

function DecisionChip({ decision }: { decision: RecordPurchaseResponse["decision"] }) {
  return decision === "APPROVED" ? (
    <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-400">
      Approved
    </span>
  ) : (
    <span className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-rose-400">
      Declined
    </span>
  );
}

function CheckChip({ value }: { value: "PASS" | "FAIL" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        value === "PASS" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-rose-500/40 bg-rose-500/10 text-rose-400",
      )}
    >
      {value}
    </span>
  );
}

function RuleChip({ blocked }: { blocked: boolean }) {
  return blocked ? (
    <span className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-400">
      Blocked
    </span>
  ) : (
    <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
      Allowed
    </span>
  );
}

function TxnChip({ tone, children }: { tone: "zinc" | "amber" | "violet"; children: React.ReactNode }) {
  const cls = {
    zinc: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    violet: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  }[tone];
  return <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", cls)}>{children}</span>;
}

// ---------- tab 1: record purchase ----------

function RecordPurchaseForm() {
  const { accounts } = useAuth();
  const { toast } = useToast();
  const [cards, setCards] = useState<CardDTO[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [cardsError, setCardsError] = useState("");

  const [accountId, setAccountId] = useState("");
  const [cardId, setCardId] = useState("none");
  const [merchantName, setMerchantName] = useState("");
  const [category, setCategory] = useState<string>("Groceries");
  const [method, setMethod] = useState("ONLINE");
  const [amount, setAmount] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [description, setDescription] = useState("");
  const [simulateDecline, setSimulateDecline] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RecordPurchaseResponse | null>(null);

  const loadCards = useCallback(async () => {
    setCardsLoading(true);
    setCardsError("");
    try {
      const data = await bankApi.get<{ cards: CardDTO[] }>("/cards");
      setCards(data.cards);
    } catch (err) {
      setCardsError(nestedErrorText(err));
    } finally {
      setCardsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      const preferred = accounts.find((a) => a.type === "CURRENT") ?? accounts[0];
      setAccountId(preferred.id);
    }
  }, [accounts, accountId]);

  function onMethodChange(next: string) {
    setMethod(next);
    if (next === "TRANSFER") setCardId("none");
  }

  async function submit() {
    if (!accountId) {
      toast({ title: "Account required", description: "Choose the account this purchase is paid from." });
      return;
    }
    if (merchantName.trim().length < 2) {
      toast({ title: "Merchant required", description: "Enter the merchant name (at least 2 characters)." });
      return;
    }
    if (orderRef.trim().length > 40) {
      toast({ title: "Order reference too long", description: "Keep the order reference under 40 characters." });
      return;
    }
    if (description.trim().length > 300) {
      toast({ title: "Description too long", description: "Keep the description under 300 characters." });
      return;
    }
    const amountMinor = parseAmountToMinor(amount);
    if (amountMinor === null || amountMinor < 1) {
      toast({ title: "Invalid amount", description: "Enter a positive amount in pounds, e.g. 24.99." });
      return;
    }
    setSubmitting(true);
    try {
      const resp = await bankApi.post<RecordPurchaseResponse>("/transactions", {
        accountId,
        cardId: cardId === "none" ? null : cardId,
        direction: "DEBIT",
        merchantName: merchantName.trim(),
        category,
        method,
        amountMinor,
        currency: "GBP",
        orderRef: orderRef.trim(),
        description: description.trim(),
        simulateDecline,
      });
      setResult(resp);
      setMerchantName("");
      setAmount("");
      setOrderRef("");
      setDescription("");
    } catch (err) {
      toast({ title: "Could not record purchase", description: nestedErrorText(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Record a purchase"
        description="The policy engine evaluates every record first — frozen cards, permission switches, merchant rules and limits all apply before the transaction is stored."
        actions={<DemoBadge tooltip="Recorded purchases are demo data" />}
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div>
            <Label className="text-xs text-zinc-400">Account</Label>
            <Select value={accountId} onValueChange={setAccountId} disabled={accounts.length === 0}>
              <SelectTrigger className="mt-1.5 w-full min-h-[44px]">
                <SelectValue placeholder={accounts.length === 0 ? "No accounts available" : "Choose account"} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} · {a.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-zinc-400">Card (optional)</Label>
            <Select value={cardId} onValueChange={setCardId} disabled={cardsLoading || method === "TRANSFER"}>
              <SelectTrigger className="mt-1.5 w-full min-h-[44px]">
                <SelectValue
                  placeholder={method === "TRANSFER" ? "Bank transfer — no card" : cardsLoading ? "Loading cards…" : "Choose card"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No card / bank transfer</SelectItem>
                {cards.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label} · *** {c.last4}
                    {c.status !== "ACTIVE" ? ` (${c.status})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cardsError ? (
              <p className="mt-1.5 text-[11px] text-rose-400">
                {cardsError}{" "}
                <button type="button" className="underline" onClick={() => void loadCards()}>
                  Retry
                </button>
              </p>
            ) : null}
            {method === "TRANSFER" ? <p className="mt-1.5 text-[11px] text-zinc-500">Transfers are not card payments — the card is ignored.</p> : null}
          </div>

          <div>
            <Label className="text-xs text-zinc-400">Merchant</Label>
            <Input
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Alpha Gadgets"
              className="mt-1.5 min-h-[44px]"
            />
          </div>

          <div>
            <Label className="text-xs text-zinc-400">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1.5 w-full min-h-[44px]">
                <SelectValue />
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

          <div>
            <Label className="text-xs text-zinc-400">Method</Label>
            <Select value={method} onValueChange={onMethodChange}>
              <SelectTrigger className="mt-1.5 w-full min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TXN_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-zinc-400">Amount (£)</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="mt-1.5 min-h-[44px]"
            />
            <p className="mt-1.5 text-[11px] text-zinc-500">Currency: GBP — fixed in this demo.</p>
          </div>

          <div className="sm:col-span-2">
            <Label className="text-xs text-zinc-400">Order reference (optional)</Label>
            <Input
              value={orderRef}
              onChange={(e) => setOrderRef(e.target.value)}
              maxLength={40}
              placeholder="e.g. NX-1024"
              className="mt-1.5 min-h-[44px]"
            />
          </div>

          <div className="sm:col-span-2">
            <Label className="text-xs text-zinc-400">Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              placeholder="What was ordered, where, and any context worth keeping"
              className="mt-1.5"
            />
          </div>

          <div className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 sm:col-span-2">
            <div className="min-w-0">
              <Label className="text-sm text-zinc-200">Simulate issuer decline (shows how a decline appears)</Label>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">Clearly labelled as a demo scenario — no real payment network is involved.</p>
            </div>
            <Switch
              checked={simulateDecline}
              onCheckedChange={setSimulateDecline}
              aria-label="Simulate issuer decline"
              className="ml-2 shrink-0 data-[state=checked]:bg-rose-600"
            />
          </div>

          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] w-full bg-emerald-600 text-white hover:bg-emerald-600/90 sm:w-auto sm:px-8"
            >
              {submitting ? "Recording…" : "Record purchase"}
            </Button>
          </div>
        </form>
      </SectionCard>

      <Dialog open={result !== null} onOpenChange={(o) => { if (!o) setResult(null); }}>
        <DialogContent className="sm:max-w-lg">
          {result ? <PurchaseResultBody result={result} onClose={() => setResult(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PurchaseResultBody({ result, onClose }: { result: RecordPurchaseResponse; onClose: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
          Purchase decision <DemoBadge tooltip="This decision was produced inside the sandbox" />
        </DialogTitle>
        <DialogDescription>Policy checks run before any record is stored — the same gates a real issuer would apply.</DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <DecisionChip decision={result.decision} />
            <StatusBadge status={result.transaction.status} />
          </div>
          <p className="mt-1.5 truncate text-sm text-zinc-200">
            {result.transaction.merchantName}
            {result.transaction.orderRef ? ` · ref ${result.transaction.orderRef}` : ""}
          </p>
        </div>
        <Money
          minor={result.transaction.amountMinor}
          currency={result.transaction.currency}
          signed={result.transaction.direction === "DEBIT" ? "DEBIT" : "CREDIT"}
          className="text-base"
        />
      </div>

      <div>
        <p className="nb-kicker mb-2">Policy checks ({result.checks.length})</p>
        <div className="max-h-56 space-y-2 overflow-y-auto nb-scroll pr-1">
          {result.checks.map((c) => (
            <div key={c.name} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-zinc-200">{c.name}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{c.detail}</p>
              </div>
              <CheckChip value={c.result} />
            </div>
          ))}
        </div>
      </div>

      {result.decision === "DECLINED" ? (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
          <p className="text-sm font-semibold text-rose-400">Declined by {result.declinedBy ?? "policy"}</p>
          <p className="mt-1 text-xs leading-relaxed text-rose-300/90">
            {result.reason ?? "The policy engine blocked this payment before it was recorded."}
          </p>
        </div>
      ) : null}

      {result.decision === "APPROVED" && result.followUp !== null ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
          <p className="text-sm font-medium text-emerald-400">4-day follow-up created — due {fmtDate(result.followUp.dueAt)}</p>
          <p className="mt-0.5 text-[11px] text-emerald-500/80">You will be asked whether the order was received.</p>
        </div>
      ) : null}

      {result.alertsCreated > 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm font-medium text-amber-400">
            {result.alertsCreated} intelligence alert(s) generated — open Insights to read the explanations.
          </p>
        </div>
      ) : null}

      <DialogFooter>
        <Button onClick={onClose} className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-600/90">
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

// ---------- tab 2: merchant rules ----------

function MerchantRules() {
  const { toast } = useToast();
  const [rules, setRules] = useState<MerchantRuleDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [cap, setCap] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [deleting, setDeleting] = useState<MerchantRuleDTO | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await bankApi.get<MerchantRulesResponse>("/merchants");
      setRules(data.rules);
    } catch (err) {
      setError(nestedErrorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(rule: MerchantRuleDTO) {
    setEditingName(rule.displayName);
    setDisplayName(rule.displayName);
    setBlocked(rule.blocked);
    setCap(rule.monthlyLimitMinor !== null ? (rule.monthlyLimitMinor / 100).toFixed(2) : "");
    setNote(rule.note ?? "");
  }

  function resetForm() {
    setEditingName("");
    setDisplayName("");
    setBlocked(false);
    setCap("");
    setNote("");
  }

  async function save() {
    if (displayName.trim().length < 2) {
      toast({ title: "Merchant name required", description: "Enter at least 2 characters — rules match on the merchant name." });
      return;
    }
    let capMinor: number | null = null;
    const trimmedCap = cap.trim();
    if (trimmedCap !== "") {
      const parsed = parseAmountToMinor(trimmedCap);
      if (parsed === null) {
        toast({ title: "Invalid monthly cap", description: "Enter an amount in pounds, e.g. 150.00, or leave blank for no cap." });
        return;
      }
      if (parsed < 100) {
        toast({ title: "Monthly cap too small", description: "Caps must be at least £1.00." });
        return;
      }
      capMinor = parsed;
    }
    setSaving(true);
    try {
      await bankApi.post<{ rule: MerchantRuleDTO }>("/merchants", {
        displayName: displayName.trim(),
        blocked,
        monthlyLimitMinor: capMinor,
        note: note.trim(),
      });
      toast({
        title: "Merchant rule saved",
        description: "Blocked merchants and monthly caps are enforced by the policy engine on every future payment.",
      });
      resetForm();
      load();
    } catch (err) {
      toast({ title: "Could not save rule", description: nestedErrorText(err) });
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(rule: MerchantRuleDTO) {
    try {
      await bankApi.del<{ removed: string }>(`/merchants?id=${encodeURIComponent(rule.id)}`);
      toast({ title: "Merchant rule removed", description: `${rule.displayName} is no longer blocked or capped.` });
      setDeleting(null);
      load();
    } catch (err) {
      toast({ title: "Could not remove rule", description: nestedErrorText(err) });
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Merchant rules"
        description="Blocked merchants and monthly caps are enforced by the policy engine on every future payment."
        actions={<DemoBadge />}
      >
        {loading ? (
          <LoadingBlock rows={3} />
        ) : error ? (
          <div className="space-y-3">
            <ErrorNote message={error} />
            <div>
              <Button variant="outline" className="min-h-[44px] border-zinc-700" onClick={load}>
                Retry
              </Button>
            </div>
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            title="No merchant rules yet"
            hint="Block a merchant or set a monthly cap below — the policy engine enforces both on every future payment."
          />
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto nb-scroll pr-1">
            {rules.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-zinc-200">{r.displayName}</p>
                    <RuleChip blocked={r.blocked} />
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Monthly cap: {r.monthlyLimitMinor !== null ? fmtMoney(r.monthlyLimitMinor) : "—"} · Spent this month:{" "}
                    {fmtMoney(r.spentThisMonthMinor ?? 0)}
                  </p>
                  {r.note ? <p className="mt-1 text-xs leading-relaxed text-zinc-500">{r.note}</p> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" className="min-h-[44px] border-zinc-700" onClick={() => startEdit(r)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-[44px] text-rose-400 hover:bg-rose-500/10"
                    onClick={() => setDeleting(r)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Add or edit a rule" description="Rules are keyed by merchant name — use the exact merchant name to update an existing rule.">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div>
            <Label className="text-xs text-zinc-400">Merchant name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Alpha Gadgets"
              className="mt-1.5 min-h-[44px]"
            />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Monthly cap (£, blank = none)</Label>
            <Input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" placeholder="e.g. 150.00" className="mt-1.5 min-h-[44px]" />
          </div>
          <div className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 sm:col-span-2">
            <div className="min-w-0">
              <Label className="text-sm text-zinc-200">Blocked</Label>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">Every future payment to this merchant is declined by the policy engine.</p>
            </div>
            <Switch
              checked={blocked}
              onCheckedChange={setBlocked}
              aria-label="Blocked"
              className="ml-2 shrink-0 data-[state=checked]:bg-rose-600"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-zinc-400">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Why this rule exists" className="mt-1.5 min-h-[44px]" />
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button
              type="submit"
              disabled={saving}
              className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              {saving ? "Saving…" : "Save rule"}
            </Button>
            {editingName ? (
              <>
                <Button type="button" variant="ghost" className="min-h-[44px] text-zinc-400" onClick={resetForm}>
                  Clear
                </Button>
                <span className="text-[11px] text-zinc-500">Editing “{editingName}” — saving overwrites the rule for that merchant name.</span>
              </>
            ) : null}
          </div>
        </form>
      </SectionCard>

      <Dialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <DialogContent className="sm:max-w-md">
          {deleting ? (
            <>
              <DialogHeader>
                <DialogTitle>Remove merchant rule?</DialogTitle>
                <DialogDescription>
                  Future payments to {deleting.displayName} will no longer be blocked or capped by this rule. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" className="min-h-[44px] border-zinc-700">
                    Cancel
                  </Button>
                </DialogClose>
                <Button variant="destructive" className="min-h-[44px]" onClick={() => void doDelete(deleting)}>
                  Delete rule
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- tab 3: purchases & analytics ----------

function PurchasesAnalytics() {
  const [txns, setTxns] = useState<TransactionDTO[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [methodSel, setMethodSel] = useState("ONLINE");
  const [statusSel, setStatusSel] = useState("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchApplied, setSearchApplied] = useState("");

  const [insights, setInsights] = useState<InsightSummary | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (methodSel !== "all") params.set("method", methodSel);
      if (statusSel !== "all") params.set("status", statusSel);
      if (searchApplied) params.set("q", searchApplied);
      params.set("page", String(page));
      params.set("pageSize", "10");
      const data = await bankApi.get<TxnListResponse>(`/transactions?${params.toString()}`);
      setTxns(data.transactions);
      setTotal(data.total);
      setPages(data.pages);
    } catch (err) {
      setError(nestedErrorText(err));
    } finally {
      setLoading(false);
    }
  }, [methodSel, statusSel, searchApplied, page]);

  useEffect(() => {
    load();
  }, [load]);

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true);
    setInsightsError("");
    try {
      setInsights(await bankApi.get<InsightSummary>("/insights"));
    } catch (err) {
      setInsightsError(nestedErrorText(err));
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  function applySearch() {
    setSearchApplied(searchDraft.trim());
    setPage(1);
  }

  const catRows = [...(insights?.byCategory ?? [])]
    .sort((a, b) => b.totalMinor - a.totalMinor)
    .slice(0, 6)
    .map((c) => ({ label: c.category, totalMinor: c.totalMinor, count: c.count }));
  const merchRows = (insights?.byMerchant ?? []).slice(0, 6).map((m) => ({ label: m.merchantName, totalMinor: m.totalMinor, count: m.count }));

  return (
    <div className="space-y-6">
      <SectionCard title="Purchases" description="Search the demo ledger, open HTML or JSON receipts, and page through records.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs text-zinc-400">Method</Label>
            <Select
              value={methodSel}
              onValueChange={(v) => {
                setMethodSel(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="mt-1.5 w-full min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                <SelectItem value="ONLINE">ONLINE</SelectItem>
                <SelectItem value="SUBSCRIPTION">SUBSCRIPTION</SelectItem>
                <SelectItem value="POS">POS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Status</Label>
            <Select
              value={statusSel}
              onValueChange={(v) => {
                setStatusSel(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="mt-1.5 w-full min-h-[44px]">
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
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-zinc-400">Search merchant or order reference</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applySearch();
                  }
                }}
                placeholder="e.g. Alpha Gadgets or NX-1024"
                className="min-h-[44px]"
              />
              <Button variant="outline" className="min-h-[44px] shrink-0 border-zinc-700" onClick={applySearch}>
                Search
              </Button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-4 space-y-3">
            <ErrorNote message={error} />
            <div>
              <Button variant="outline" className="min-h-[44px] border-zinc-700" onClick={load}>
                Retry
              </Button>
            </div>
          </div>
        ) : loading ? (
          <div className="mt-4">
            <LoadingBlock rows={4} />
          </div>
        ) : txns.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No purchases match these filters" hint="Try widening the method or status filters, or clear the search." />
          </div>
        ) : (
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto nb-scroll pr-1">
            {txns.map((t) => (
              <div key={t.id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-zinc-200">{t.merchantName}</p>
                      <StatusBadge status={t.status} />
                      {t.isDemo ? <DemoBadge /> : null}
                    </div>
                    <p className="mt-1 truncate text-[11px] text-zinc-500">
                      {t.method}
                      {t.category ? ` · ${t.category}` : ""}
                      {t.orderRef ? ` · ref ${t.orderRef}` : ""}
                      {t.cardLast4 ? ` · *** ${t.cardLast4}` : ""} · {fmtDateTime(t.createdAt)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {t.refundedMinor > 0 ? (
                        <TxnChip tone="zinc">refunded {fmtMoney(t.refundedMinor, t.currency)}</TxnChip>
                      ) : null}
                      {t.hasFollowUp ? <TxnChip tone="amber">4-day follow-up</TxnChip> : null}
                      {t.disputeStatus ? <TxnChip tone="violet">dispute: {t.disputeStatus.replace(/_/g, " ").toLowerCase()}</TxnChip> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    <Money
                      minor={t.amountMinor}
                      currency={t.currency}
                      signed={t.direction === "DEBIT" ? "DEBIT" : "CREDIT"}
                      className="text-base"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[44px] border-zinc-700"
                        onClick={() => window.open(`/api/bank/receipts/${t.id}?format=html`, "_blank")}
                      >
                        Receipt
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-[44px] text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => window.open(`/api/bank/receipts/${t.id}?format=json`, "_blank")}
                      >
                        JSON
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px] border-zinc-700"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <p className="text-xs text-zinc-500">
            Page {page} of {pages} · {total} demo record{total === 1 ? "" : "s"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px] border-zinc-700"
            disabled={page >= pages || loading}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >
            Next
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Month-to-date analytics"
        description="Top categories and merchants, aggregated from stored demo transactions."
        actions={<DemoBadge tooltip="All analytics numbers are demo data" />}
      >
        {insightsLoading ? (
          <LoadingBlock rows={4} />
        ) : insightsError ? (
          <div className="space-y-3">
            <ErrorNote message={insightsError} />
            <div>
              <Button variant="outline" className="min-h-[44px] border-zinc-700" onClick={loadInsights}>
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="nb-kicker mb-3">By category</p>
              <BarList rows={catRows} />
            </div>
            <div>
              <p className="nb-kicker mb-3">By merchant</p>
              <BarList rows={merchRows} />
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function BarList({ rows }: { rows: { label: string; totalMinor: number; count: number }[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-xs text-zinc-500">
        No spend recorded yet this month.
      </p>
    );
  }
  const max = rows[0].totalMinor;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-zinc-300">{r.label}</span>
            <span className="nb-num shrink-0 text-zinc-400">
              {fmtMoney(r.totalMinor)} <span className="text-zinc-600">({r.count})</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted/50">
            <div className={cn("h-full rounded-full bg-emerald-500/80", barWidthClass(max > 0 ? (r.totalMinor / max) * 100 : 0))} />
          </div>
        </div>
      ))}
    </div>
  );
}
