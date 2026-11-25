"use client";

/**
 * NEXUS BANK — Settings. Profile, demo account management and data controls.
 * Everything here is honest about what a sandbox can and cannot do.
 */
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, SectionCard, Money, DemoBadge, EmptyState, ErrorNote } from "@/lib/bank-ui";
import { useAuth } from "@/lib/auth-context";
import { bankApi, nestedErrorText } from "@/lib/bank-client";
import { useToast } from "@/hooks/use-toast";

type AccountType = "CURRENT" | "SAVINGS";

const ENV_POINTS: { text: string; tone: "ok" | "warn" }[] = [
  { tone: "warn", text: "No real payments are processed anywhere in this environment — every transaction is a demo record you created." },
  { tone: "warn", text: "No external providers are connected: no payment processors, no webhooks, no third-party data feeds." },
  { tone: "ok", text: "All data is demo-labelled and fully erasable; nothing here represents a real financial position." },
  { tone: "ok", text: "An append-only audit trail records security-relevant actions such as password changes and data erasure." },
];

export function SettingsView() {
  const { user, accounts, logout, refresh } = useAuth();
  const { toast } = useToast();

  // Open additional demo account
  const [accOpen, setAccOpen] = useState(false);
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<AccountType>("CURRENT");
  const [accError, setAccError] = useState("");
  const [openingAcc, setOpeningAcc] = useState(false);

  // Data controls
  const [signingOut, setSigningOut] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseWord, setEraseWord] = useState("");
  const [erasing, setErasing] = useState(false);
  const [eraseError, setEraseError] = useState("");

  async function openAccount() {
    setAccError("");
    const name = accName.trim();
    if (name.length < 2 || name.length > 60) {
      setAccError("Give the account a name of 2–60 characters.");
      return;
    }
    setOpeningAcc(true);
    try {
      await bankApi.post("/accounts", { name, type: accType });
      toast({ title: "Demo account opened", description: `${name} — ${accType === "SAVINGS" ? "Savings" : "Current"}` });
      setAccOpen(false);
      setAccName("");
      setAccType("CURRENT");
      await refresh();
    } catch (err) {
      toast({ title: "Could not open account", description: nestedErrorText(err), variant: "destructive" });
    } finally {
      setOpeningAcc(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
      // The auth context clears; the app gate takes over rendering.
    } catch (err) {
      toast({ title: "Could not sign out", description: nestedErrorText(err), variant: "destructive" });
      setSigningOut(false);
    }
  }

  async function eraseAllData() {
    setEraseError("");
    if (eraseWord !== "ERASE") {
      setEraseError("Type ERASE exactly to confirm.");
      return;
    }
    setErasing(true);
    try {
      await bankApi.del("/auth/data");
      toast({ title: "All data erased", description: "Your demo records were permanently deleted. You have been signed out." });
      setEraseOpen(false);
      setEraseWord("");
      await refresh(); // auth context clears on the 401; the sign-in gate takes over.
    } catch (err) {
      toast({ title: "Could not erase data", description: nestedErrorText(err), variant: "destructive" });
    } finally {
      setErasing(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Settings"
        title="Settings & Data Controls"
        description="Your profile, demo account management, and full control over this sandbox's data — including erasing it entirely."
        actions={<DemoBadge />}
      />

      {!user ? <ErrorNote message="Profile unavailable — you are signed out." /> : null}

      {/* ---------- Profile ---------- */}
      <SectionCard title="Profile" description="Profile is stored server-side; email is only used for sign-in.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
            <span className="text-xs text-zinc-500">Name</span>
            <span className="truncate text-sm font-medium text-zinc-200">{user?.name ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
            <span className="text-xs text-zinc-500">Email</span>
            <span className="truncate text-sm text-zinc-300">{user?.email ?? "—"}</span>
          </div>
        </div>
      </SectionCard>

      {/* ---------- Demo accounts ---------- */}
      <SectionCard
        title="Demo accounts"
        description="Balances are sandbox records in minor units. Additional accounts open with a zero balance and are labelled demo."
        actions={
          <Button variant="outline" size="sm" className="border-zinc-700" onClick={() => setAccOpen(true)}>
            Open additional demo account
          </Button>
        }
      >
        {accounts.length === 0 ? (
          <EmptyState title="No accounts yet" hint="Open a demo account to start recording sandbox transactions." />
        ) : (
          <div className="space-y-2">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-200">{a.name}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-500">{a.type}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <DemoBadge />
                  <Money minor={a.balanceMinor} currency={a.currency} className="text-base" />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ---------- Data controls ---------- */}
      <SectionCard
        title="Data controls"
        description="End the current session, or erase every record this sandbox holds about you."
      >
        <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200">Sign out of this device</p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              Ends this session immediately. Your demo records are kept and you can sign back in at any time.
            </p>
          </div>
          <Button variant="outline" className="border-zinc-700" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </SectionCard>

      {/* ---------- Danger: erasure ---------- */}
      <Card className="border-rose-500/40 bg-rose-500/5">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold text-rose-400">Danger zone — erase all my data</CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Permanently deletes every demo record tied to your account — accounts, transactions, cards, budgets, disputes, alerts and
              audit history — then signs you out. This cannot be undone.
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Button variant="destructive" onClick={() => setEraseOpen(true)}>
            Erase all my data
          </Button>
        </CardContent>
      </Card>

      {/* ---------- Environment ---------- */}
      <SectionCard
        title="About this environment"
        description="What this demo platform is, and what it deliberately is not."
      >
        <ul className="space-y-3">
          {ENV_POINTS.map((p) => (
            <li key={p.text} className="flex items-start gap-3">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${p.tone === "ok" ? "bg-emerald-400" : "bg-amber-400"}`}
                aria-hidden
              />
              <span className="text-xs leading-relaxed text-zinc-300">{p.text}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* ---------- Open account dialog ---------- */}
      <Dialog open={accOpen} onOpenChange={(open) => { if (!open) setAccOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open additional demo account</DialogTitle>
            <DialogDescription>New accounts start at £0.00 in GBP and are labelled as demo data throughout the app.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="acc-name" className="text-xs text-zinc-400">
                Account name
              </Label>
              <Input
                id="acc-name"
                placeholder="e.g. Everyday Spending"
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-type" className="text-xs text-zinc-400">
                Account type
              </Label>
              <Select value={accType} onValueChange={(v: string) => setAccType(v === "SAVINGS" ? "SAVINGS" : "CURRENT")}>
                <SelectTrigger id="acc-type" className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CURRENT">Current</SelectItem>
                  <SelectItem value="SAVINGS">Savings</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {accError ? <p className="text-xs text-rose-400">{accError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-zinc-700" onClick={() => setAccOpen(false)}>
              Cancel
            </Button>
            <Button onClick={openAccount} disabled={openingAcc}>
              {openingAcc ? "Opening…" : "Open account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Erase all data confirm ---------- */}
      <AlertDialog
        open={eraseOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEraseOpen(false);
            setEraseWord("");
            setEraseError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Erase all my data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every demo record tied to your account and signs you out. There is no undo and no recovery. To
              confirm, type <span className="font-mono font-bold text-rose-400">ERASE</span> below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            aria-label="Type ERASE to confirm"
            placeholder="ERASE"
            value={eraseWord}
            onChange={(e) => setEraseWord(e.target.value)}
            className="min-h-[44px]"
          />
          {eraseError ? <p className="text-xs text-rose-400">{eraseError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={eraseWord !== "ERASE" || erasing}
              onClick={(e) => {
                e.preventDefault();
                eraseAllData();
              }}
            >
              {erasing ? "Erasing…" : "Erase everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
