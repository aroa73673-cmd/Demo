"use client";

/**
 * NEXUS BANK — authentication gate. Premium split-screen sign-in/registration
 * with honest disclosure of what this environment is and is not.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, nestedErrorText } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export function AuthGate() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
    } catch (err) {
      setError(nestedErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = mode === "login" ? email.length > 0 && password.length > 0 : name.trim().length >= 2 && email.length > 0 && password.length >= 10;

  return (
    <div className="nb-grid-glow flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-border shadow-2xl lg:grid lg:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden flex-col justify-between border-r border-border bg-sidebar p-10 lg:flex">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-xl font-bold text-emerald-400">N</div>
              <div>
                <p className="text-sm font-bold tracking-[0.14em] text-zinc-100">NEXUS BANK</p>
                <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Elite 2027</p>
              </div>
            </div>
            <h2 className="mt-14 text-3xl font-semibold leading-tight tracking-tight text-zinc-50">
              Serious banking,
              <br />
              engineered for 2027.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-zinc-400">
              Card controls with real decline logic, online purchase management, four-day delivery follow-ups, explainable transaction
              intelligence and a transparent dispute lifecycle.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-zinc-300">
              {[
                "Freeze, limits, merchant rules and permissions that actually block payments",
                "Four-day follow-up centre for every online order",
                "Disputes require a genuine issue — never auto-reversed",
                "Every alert explains exactly why it fired",
              ].map((li) => (
                <li key={li} className="flex items-start gap-2.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {li}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Sandbox demonstration. All data is clearly labelled demo data — no real accounts, cards, credentials or payment authorisations exist here.
          </p>
        </div>

        {/* Form panel */}
        <div className="bg-card p-6 sm:p-10">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-lg font-bold text-emerald-400">N</div>
            <div>
              <p className="text-sm font-bold tracking-[0.14em]">NEXUS BANK</p>
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Elite 2027</p>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-lg border border-border bg-muted/40 p-1">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors min-h-[40px]",
                  mode === m ? "bg-emerald-500/15 text-emerald-300" : "text-zinc-400 hover:text-zinc-200",
                )}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="nb-name">Full name</Label>
                <Input id="nb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Morgan" autoComplete="name" maxLength={60} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="nb-email">Email</Label>
              <Input id="nb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" maxLength={200} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-pass">Password</Label>
              <Input
                id="nb-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "At least 10 characters" : "Your password"}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                maxLength={128}
                required
              />
              {mode === "register" && (
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Minimum 10 characters with upper case, lower case and a digit. Hashed with scrypt — never stored in plain text.
                </p>
              )}
            </div>

            {error && (
              <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-400">{error}</div>
            )}

            <Button type="submit" disabled={busy || !canSubmit} className="w-full min-h-[44px] bg-emerald-500/90 text-emerald-950 hover:bg-emerald-400">
              {busy ? "Working…" : mode === "login" ? "Sign in securely" : "Create demo account"}
            </Button>
          </form>

          <p className="mt-6 text-[11px] leading-relaxed text-zinc-500">
            Creating an account provisions a clearly-labelled demo environment: two accounts, three cards, sample transactions, budgets and
            follow-ups. No email verification, no real bank connection, no payment capability.
          </p>
        </div>
      </div>
    </div>
  );
}
