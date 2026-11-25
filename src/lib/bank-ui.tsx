"use client";

/**
 * NEXUS BANK — shared UI atoms. Every view composes from these so the design
 * language stays consistent across the whole platform.
 */
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ---------- Money ----------

export function Money({
  minor,
  currency = "GBP",
  className,
  signed,
}: {
  minor: number;
  currency?: string;
  className?: string;
  signed?: "DEBIT" | "CREDIT";
}) {
  const text = signed ? (signed === "DEBIT" ? `-${fmtMoney(minor, currency)}` : `+${fmtMoney(minor, currency)}`) : fmtMoney(minor, currency);
  const tone = signed === "DEBIT" ? "text-foreground" : signed === "CREDIT" ? "text-emerald-400" : "";
  return <span className={cn("nb-num font-semibold", tone, className)}>{text}</span>;
}

// ---------- Demo data badge ----------

export function DemoBadge({ className, tooltip }: { className?: string; tooltip?: string }) {
  return (
    <span
      title={tooltip ?? "Demo data — created inside the sandbox. Not a real financial record."}
      className={cn(
        "inline-flex items-center gap-1 rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400",
        className,
      )}
    >
      Demo
    </span>
  );
}

// ---------- Status badges ----------

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  ACTIVE: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  CONFIRMED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  RESOLVED_WON: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  APPROVED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  PENDING: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  REQUESTED: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  SUBMITTED: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  UNDER_REVIEW: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  PROVISIONAL_CREDIT: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  PARTIALLY_REFUNDED: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  REFUNDED: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  DECLINED: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  DECLINED_POLICY: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  DECLINED_PROVIDER: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  BLOCKED: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  FROZEN: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  CANCELLED: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400",
  REPLACED: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400",
  WITHDRAWN: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400",
  RESOLVED_LOST: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  DISPUTED: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  RESOLVED: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] ?? "border-zinc-500/40 bg-zinc-500/10 text-zinc-400";
  const label = status.replace(/_/g, " ");
  return (
    <Badge variant="outline" className={cn("border px-2 py-0 text-[10px] font-semibold uppercase tracking-wide", style, className)}>
      {label}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: "INFO" | "WARN" | "CRITICAL" }) {
  const style = {
    INFO: "border-sky-500/40 bg-sky-500/10 text-sky-400",
    WARN: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    CRITICAL: "border-rose-500/40 bg-rose-500/10 text-rose-400",
  }[severity];
  return (
    <Badge variant="outline" className={cn("border px-2 py-0 text-[10px] font-semibold uppercase tracking-wide", style)}>
      {severity}
    </Badge>
  );
}

// ---------- Page scaffolding ----------

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="nb-kicker">{kicker}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h2>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "default" | "positive" | "warning" | "negative";
  className?: string;
}) {
  const toneClass = {
    default: "text-foreground",
    positive: "text-emerald-400",
    warning: "text-amber-400",
    negative: "text-rose-400",
  }[tone];
  return (
    <Card className={cn("border-border/60 bg-card", className)}>
      <CardContent className="p-4 sm:p-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("nb-num mt-2 text-2xl font-bold sm:text-[26px]", toneClass)}>{value}</p>
        {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("border-border/60 bg-card", className)}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
          {description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className={cn("pt-0", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

// ---------- Empty & loading ----------

export function EmptyState({ title, hint, icon, action }: { title: string; hint?: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-card/40 px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-muted-foreground/70">{icon}</div> : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingBlock({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg bg-muted/60" />
      ))}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-400">
      {message}
    </div>
  );
}

// ---------- Timestamps ----------

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function relativeDays(iso: string): number {
  const then = new Date(iso).getTime();
  return Math.round((then - Date.now()) / 86_400_000);
}
