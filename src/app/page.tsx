"use client";

/**
 * NEXUS BANK — ELITE 2027. Single-route application shell.
 * View switching is state-driven (instant, no server round-trips) and
 * synchronised with the URL hash via useSyncExternalStore so refresh and
 * back/forward keep context without setState-in-effect patterns.
 */
import { useCallback, useSyncExternalStore } from "react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { HubView } from "@/components/views/hub";
import { DashboardView } from "@/components/views/dashboard";
import { CardsView } from "@/components/views/cards";
import { ShoppingView } from "@/components/views/shopping";
import { TransactionsView } from "@/components/views/transactions";
import { FollowUpsView } from "@/components/views/followups";
import { DisputesView } from "@/components/views/disputes";
import { InsightsView } from "@/components/views/insights";
import { SecurityView } from "@/components/views/security";
import { RoadmapView } from "@/components/views/roadmap";
import { SettingsView } from "@/components/views/settings";
import { ViewId } from "@/lib/views";

const VALID: ViewId[] = ["hub", "dashboard", "cards", "shopping", "followups", "transactions", "disputes", "insights", "security", "roadmap", "settings"];

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getHashSnapshot(): string {
  const h = window.location.hash.replace("#", "");
  return VALID.includes(h as ViewId) ? h : "hub";
}

function BankApp() {
  const { user, loading } = useAuth();
  const view = useSyncExternalStore(subscribeHash, getHashSnapshot, () => "hub") as ViewId;

  const navigate = useCallback((v: ViewId) => {
    if (getHashSnapshot() === v) return;
    window.location.hash = v;
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-xl bg-emerald-500/15 text-xl font-bold text-emerald-400">N</div>
          <p className="text-xs text-zinc-500">Connecting to NEXUS BANK…</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthGate />;

  return (
    <AppShell view={view} onNavigate={navigate}>
      {view === "hub" && <HubView onNavigate={navigate} />}
      {view === "dashboard" && <DashboardView onNavigate={navigate} />}
      {view === "cards" && <CardsView />}
      {view === "shopping" && <ShoppingView />}
      {view === "transactions" && <TransactionsView />}
      {view === "followups" && <FollowUpsView onNavigate={navigate} />}
      {view === "disputes" && <DisputesView />}
      {view === "insights" && <InsightsView />}
      {view === "security" && <SecurityView />}
      {view === "roadmap" && <RoadmapView />}
      {view === "settings" && <SettingsView />}
    </AppShell>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <BankApp />
    </AuthProvider>
  );
}
