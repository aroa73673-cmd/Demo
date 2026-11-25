"use client";

/**
 * NEXUS BANK — application shell.
 * Design language inherited from the original NEXUS PAYLAB: deep graphite canvas,
 * emerald institutional accent, numbered grouped sidebar, mobile sheet nav and
 * an honesty-first footer. Upgraded for banking: grouped sections, demo-environment
 * banner, live API indicator.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { VIEWS, ViewId } from "@/lib/views";

const GROUP_ORDER = ["Overview", "Money", "Protection", "Intelligence", "Trust"] as const;

export function AppShell({
  view,
  onNavigate,
  children,
}: {
  view: ViewId;
  onNavigate: (v: ViewId) => void;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/bank/overview", { credentials: "same-origin" });
        if (alive) setApiDown(!(res.status === 200 || res.status === 401));
      } catch {
        if (alive) setApiDown(true);
      }
    };
    check();
    const t = setInterval(check, 45000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const doLogout = useCallback(async () => {
    try {
      await logout();
    } catch (err) {
      console.error(err);
    }
  }, [logout]);

  const nav = (v: ViewId) => {
    onNavigate(v);
    setMobileOpen(false);
    window.scrollTo({ top: 0 });
  };

  const current = VIEWS.find((v) => v.id === view);

  const sidebarNav = (
    <nav aria-label="Main navigation" className="flex flex-col gap-1 px-2">
      {GROUP_ORDER.map((group) => {
        const items = VIEWS.filter((v) => v.group === group);
        return (
          <div key={group} className="mt-3 first:mt-0">
            <p className="nb-kicker px-3 pb-1.5 text-[10px]">{group}</p>
            {items.map((v, i) => {
              const idx = VIEWS.findIndex((x) => x.id === v.id) + 1;
              return (
                <button
                  key={v.id}
                  onClick={() => nav(v.id)}
                  className={cn(
                    "flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    view === v.id
                      ? "bg-emerald-500/15 font-medium text-emerald-300"
                      : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
                  )}
                  aria-current={view === v.id ? "page" : undefined}
                >
                  <span className="text-[10px] font-semibold text-zinc-600 tabular-nums">{String(idx).padStart(2, "0")}</span>
                  <span className="flex-1 truncate">{v.label}</span>
                  <ViewGlyph id={v.id} />
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {apiDown && (
        <div className="border-b border-rose-500/40 bg-rose-500/10 px-4 py-2 text-center text-xs text-rose-400">
          The NEXUS BANK API is not responding. The banking service may be restarting — try again shortly.
        </div>
      )}
      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex xl:w-64">
          <button onClick={() => nav("hub")} className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4 text-left">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-lg font-bold text-emerald-400">N</div>
            <div>
              <p className="text-sm font-semibold tracking-wide text-zinc-100">NEXUS BANK</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Elite 2027</p>
            </div>
          </button>
          <ScrollArea className="flex-1 py-3">{sidebarNav}</ScrollArea>
          <div className="border-t border-sidebar-border p-3">
            <p className="mb-1 truncate text-xs font-medium text-zinc-300" title={user?.email}>{user?.name}</p>
            <p className="mb-2 truncate text-[11px] text-zinc-500" title={user?.email}>{user?.email}</p>
            <Button variant="outline" size="sm" className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={doLogout}>
              Sign out
            </Button>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile header */}
          <header className="sticky top-0 z-40 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:px-8">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="shrink-0 border-zinc-700 lg:hidden" aria-label="Open navigation menu">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" /></svg>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-72 border-border bg-sidebar p-0">
                    <SheetTitle className="border-b border-sidebar-border px-4 py-3 text-sm text-zinc-200">NEXUS BANK — Elite 2027</SheetTitle>
                    <ScrollArea className="h-[calc(100%-52px)] py-2">{sidebarNav}</ScrollArea>
                  </SheetContent>
                </Sheet>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="lg:hidden flex h-6 w-6 items-center justify-center rounded bg-emerald-500/15 text-xs font-bold text-emerald-400">N</span>
                    <h1 className="truncate text-sm font-semibold text-zinc-100 sm:text-base">{current?.label}</h1>
                  </div>
                  <p className="hidden truncate text-xs text-zinc-500 sm:block">{current?.description}</p>
                </div>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-400">
                  <span className="nb-live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                  Sandbox online
                </span>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-5 lg:px-8 lg:py-7">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>

          <footer className="mt-auto border-t border-border bg-sidebar/60 px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)] text-center lg:px-6">
            <p className="text-[11px] leading-relaxed text-zinc-500">
              NEXUS BANK Elite 2027 — a sandbox demonstration of a premium banking platform. Every balance, card and transaction shown here is
              <span className="mx-1 font-semibold uppercase tracking-wide text-amber-400">demo data</span>
              and never a real financial record. No payment network, issuer or merchant system is contacted.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

function ViewGlyph({ id }: { id: ViewId }) {
  const paths: Record<ViewId, React.ReactNode> = {
    hub: <path d="M3 10l9-7 9 7M5 9.5V21h14V9.5M9.5 21v-6h5v6" />,
    dashboard: <path d="M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0" />,
    cards: <path d="M2 5h20v14H2zM2 10h20M6 15h4" />,
    shopping: <path d="M6 2 4 6v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4zM4 6h16M9 10a3 3 0 0 0 6 0" />,
    followups: <path d="M12 22a10 10 0 1 0-10-10M12 6v6l4 2M2 2l20 20" />,
    transactions: <path d="M7 16V4M7 4 3 8M7 4l4 4M17 8v12m0 0 4-4m-4 4-4-4" />,
    disputes: <path d="M12 3l10 18H2L12 3zM12 10v4M12 17.5v.5" />,
    insights: <path d="M3 21h18M6 17v-5M11 17V8M16 17v-3M21 17V4" />,
    security: <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10zM9 12l2 2 4-4" />,
    roadmap: <path d="M4 19V5a2 2 0 0 1 2-2h13l-3 4 3 4H6M4 19a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />,
    settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87M4 4h16v16H4z" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden>
      {paths[id]}
    </svg>
  );
}
