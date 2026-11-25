"use client";

/**
 * NEXUS BANK — Home hub. Overview, start-here guidance and module map.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, StatCard, DemoBadge } from "@/lib/bank-ui";
import { fmtMoney } from "@/lib/money";
import { useAuth } from "@/lib/auth-context";
import { ViewId } from "@/lib/views";

const MODULES: { id: ViewId; no: string; title: string; desc: string; hint: string }[] = [
  { id: "dashboard", no: "01", title: "Accounts & Dashboard", desc: "Balances, pending payments, alerts", hint: "أرصدة وحساباتك في مكان واحد" },
  { id: "cards", no: "02", title: "Cards", desc: "Freeze, limits, permissions, replacement", hint: "إدارة كروتك بالكامل" },
  { id: "shopping", no: "03", title: "Shopping & Purchases", desc: "Record purchases, receipts, merchant rules", hint: "إدارة مشترياتك عبر الإنترنت" },
  { id: "transactions", no: "04", title: "Transactions", desc: "Search, filter, inspect and download receipts", hint: "بحث وتصفية الحركات" },
  { id: "followups", no: "05", title: "Follow-up Centre", desc: "4-day delivery monitoring for online orders", hint: "متابعة طلباتك بعد ٤ أيام" },
  { id: "disputes", no: "06", title: "Dispute Centre", desc: "Genuine-issue disputes with lifecycle tracking", hint: "الاعتراض على العمليات المشكوك بها" },
  { id: "insights", no: "07", title: "Insights & Alerts", desc: "Explainable intelligence, budgets, analytics", hint: "تحليلات وإنذارات ذكية" },
  { id: "security", no: "08", title: "Security Centre", desc: "Sessions, audit trail, protection status", hint: "الأمان وسجل التدقيق" },
  { id: "roadmap", no: "09", title: "2027 Roadmap", desc: "Evaluated banking technology priorities", hint: "خارطة طريق التقنية" },
  { id: "settings", no: "10", title: "Settings", desc: "Profile, password, data controls", hint: "الإعدادات والبيانات" },
];

export function HubView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const { user, accounts } = useAuth();
  const total = accounts.reduce((s, a) => s + a.balanceMinor, 0);

  const steps: { n: number; title: string; desc: string; view: ViewId }[] = [
    { n: 1, title: "Review your demo portfolio", desc: "Balances, cards and recent activity — all demo data", view: "dashboard" },
    { n: 2, title: "Record an online purchase", desc: "Watch the 4-day follow-up and intelligence engine react", view: "shopping" },
    { n: 3, title: "Set your card controls", desc: "Freeze, limits, merchant rules — then see them block payments", view: "cards" },
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        kicker="Welcome"
        title={`Welcome, ${user?.name ?? "Analyst"}`}
        description="هذه بيئة تجريبية — كل شيء هنا مُنظّم في مكان واحد. A complete demo banking environment: every record is labelled demo data, and every control genuinely works inside the sandbox."
        actions={<DemoBadge tooltip="The entire environment is demo data" />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Demo total balance" value={fmtMoney(total)} sub="Across all demo accounts" />
        <StatCard label="Demo accounts" value={accounts.length} sub="Current + savings" />
        <StatCard label="Purchase follow-ups" value="4-day" sub="Every online order monitored" tone="positive" />
        <StatCard label="Environment" value="Sandbox" sub="No real payments possible" />
      </div>

      <section aria-labelledby="start-here">
        <div className="flex items-center justify-between">
          <h3 id="start-here" className="nb-kicker text-emerald-400">Start here — سِير خطواتك الأولى</h3>
          <span className="text-[11px] text-zinc-500">three guided steps</span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {steps.map((s) => (
            <button
              key={s.n}
              onClick={() => onNavigate(s.view)}
              className="group flex items-start gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-sm font-bold text-emerald-400">{s.n}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-100 group-hover:text-emerald-300">{s.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-zinc-500">{s.desc}</span>
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ml-auto mt-2 h-4 w-4 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-400"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="all-modules">
        <div className="flex items-center justify-between">
          <h3 id="all-modules" className="nb-kicker text-emerald-400">All modules ({MODULES.length})</h3>
          <span className="text-[11px] text-zinc-500">كل الوحدات</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <Card
              key={m.id}
              className="cursor-pointer border-border bg-card transition-colors hover:border-emerald-500/40"
              onClick={() => onNavigate(m.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-100">{m.title}</p>
                  <span className="text-[10px] font-semibold text-zinc-600">{m.no}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{m.desc}</p>
                <p className="mt-2 text-[11px] text-emerald-500/80">{m.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card className="border-amber-500/25 bg-amber-500/5">
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-amber-300/90">
            <span className="font-semibold">Honesty contract:</span> this platform never represents demo data as real banking activity, never
            generates card credentials, and never auto-disputes a legitimate purchase.
          </p>
          <Button size="sm" variant="outline" className="shrink-0 border-amber-500/40 text-amber-300 hover:bg-amber-500/10" onClick={() => onNavigate("security")}>
            How we protect data
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
