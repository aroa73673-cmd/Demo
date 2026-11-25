"use client";

/**
 * NEXUS BANK — 2027 Roadmap. Banking technology priorities, evaluated line by
 * line on usefulness, security, feasibility and regulatory clarity. All
 * content is typed editorial data rendered locally — no network calls.
 */
import { type ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { DemoBadge, PageHeader, SectionCard, StatCard } from "@/lib/bank-ui";
import { cn } from "@/lib/utils";

// ---------- Types ----------

type Feasibility = "READY_NOW" | "NEAR_TERM" | "RESEARCH";
type RoadmapStatus = "IMPLEMENTED" | "PLANNED" | "SIMULATED_DEMO" | "RESEARCH";

interface RoadmapScores {
  usefulness: number;
  security: number;
  feasibility: number;
  regulatory: number;
}

interface RoadmapItem {
  id: string;
  name: string;
  what: string;
  why: string;
  security: string;
  feasibility: Feasibility;
  status: RoadmapStatus;
  scores: RoadmapScores;
}

interface RoadmapTier {
  id: string;
  title: string;
  tagline: string;
  items: RoadmapItem[];
}

// ---------- Chip vocabulary ----------

interface ChipSpec {
  label: string;
  cls: string;
}

const STATUS_CHIP: Record<RoadmapStatus, ChipSpec> = {
  IMPLEMENTED: { label: "Implemented", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  PLANNED: { label: "Planned", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
  SIMULATED_DEMO: { label: "Simulated demo", cls: "border-sky-500/40 bg-sky-500/10 text-sky-400" },
  RESEARCH: { label: "Research", cls: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400" },
};

const FEASIBILITY_CHIP: Record<Feasibility, ChipSpec> = {
  READY_NOW: { label: "Ready now", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  NEAR_TERM: { label: "Near term", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
  RESEARCH: { label: "Research", cls: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400" },
};

// ---------- Data: Tier 1 — Essential (delivered in this build) ----------

const TIER_1: RoadmapItem[] = [
  {
    id: "t1-sca",
    name: "Strong Customer Authentication controls",
    what: "Permission switches, freeze and per-transaction, daily and monthly limits are enforced by a server-side policy engine on every authorisation attempt. Each decline names the exact control that fired, so a blocked payment is always explainable.",
    why: "You decide precisely how each card may be used and can tighten or relax a control in one tap, with the policy engine applying it instantly across every channel.",
    security: "Mirrors the PSD2/PSD3 strong customer authentication framework: independent factors, limit thresholds and immediate revocation are treated as baseline obligations, not premium extras.",
    feasibility: "READY_NOW",
    status: "IMPLEMENTED",
    scores: { usefulness: 5, security: 5, feasibility: 5, regulatory: 5 },
  },
  {
    id: "t1-virtual",
    name: "Virtual cards",
    what: "Sandbox-issued single-network virtual cards are created on demand with their own masked fragment, expiry window and independent control set. A virtual card can be frozen, capped or closed without touching the underlying account.",
    why: "Merchant-scoped virtual cards isolate online spending, so a leaked merchant credential cannot spread to your main card or drain your budget.",
    security: "Only masked last-4 fragments exist in the sandbox — no live PAN or CVV is ever generated — matching issuer-host tokenisation practice and PCI DSS scope reduction.",
    feasibility: "READY_NOW",
    status: "IMPLEMENTED",
    scores: { usefulness: 5, security: 4, feasibility: 5, regulatory: 4 },
  },
  {
    id: "t1-tokenisation",
    name: "Tokenisation by design",
    what: "No full card number, CVV or magnetic equivalent is stored, displayed or transmitted anywhere in the platform. Every card reference is a masked last-4 fragment resolved from the issuer record.",
    why: "The breach blast radius is minimised by construction: there is no primary account number in the database to steal in the first place.",
    security: "Follows EMVCo tokenisation and PCI DSS scope-reduction guidance — sensitive authentication data is excluded from storage by design, not merely hidden by the interface.",
    feasibility: "READY_NOW",
    status: "IMPLEMENTED",
    scores: { usefulness: 5, security: 5, feasibility: 5, regulatory: 5 },
  },
  {
    id: "t1-notifications",
    name: "Real-time notification fabric",
    what: "Every recorded transaction is evaluated by explainable rules for unusual spend, duplicates, new recurring patterns and merchant risk. Each alert names the rule that fired and the evidence behind it.",
    why: "Suspicious or accidental activity surfaces in seconds, and every alert is understandable rather than an opaque risk score you cannot challenge.",
    security: "Alert content is scoped to the authenticated session of the account holder, following GDPR data-minimisation: explanations reveal patterns, not raw transaction payloads.",
    feasibility: "READY_NOW",
    status: "IMPLEMENTED",
    scores: { usefulness: 5, security: 4, feasibility: 5, regulatory: 4 },
  },
  {
    id: "t1-budget",
    name: "Automated budgeting with category caps",
    what: "Category budgets accumulate spend against monthly caps and raise breach alerts as thresholds are crossed. Budget state is recomputed from the transaction ledger rather than entered by hand.",
    why: "Spending pressure becomes visible before it becomes an overdraft, and breach alerts arrive while you can still change course this month.",
    security: "Aggregations run over the account holder's own stored records with session-scoped authorisation; no spend data crosses between users.",
    feasibility: "READY_NOW",
    status: "IMPLEMENTED",
    scores: { usefulness: 4, security: 4, feasibility: 5, regulatory: 4 },
  },
  {
    id: "t1-merchant",
    name: "Merchant intelligence",
    what: "Per-merchant rules support caps, blocking and monitoring, with monthly spend per merchant visible on each card. Rules are enforced by the same policy engine that decides payments, not by a parallel display layer.",
    why: "Blocking one merchant stops every future attempt with a clear reason, which is far more effective than disputing charges one by one.",
    security: "Merchant descriptors are normalised before rule evaluation so name-mangled transactions cannot slip past controls — a known evasion pattern in card fraud.",
    feasibility: "READY_NOW",
    status: "IMPLEMENTED",
    scores: { usefulness: 4, security: 4, feasibility: 5, regulatory: 4 },
  },
  {
    id: "t1-session",
    name: "Session security",
    what: "Sessions use hashed opaque tokens carried in HttpOnly cookies with sliding renewal and explicit revocation. Every sign-in, renewal and revocation is written to an append-only audit trail.",
    why: "A copied cookie stops working the moment you revoke it, and the audit trail lets you see every session that touched the account.",
    security: "Implements the OWASP Session Management Cheat Sheet: server-side token hashing, Secure and SameSite cookie attributes, idle timeout with absolute expiry.",
    feasibility: "READY_NOW",
    status: "IMPLEMENTED",
    scores: { usefulness: 5, security: 5, feasibility: 5, regulatory: 5 },
  },
];

// ---------- Data: Tier 2 — High-value next ----------

const TIER_2: RoadmapItem[] = [
  {
    id: "t2-passkeys",
    name: "Passkeys (FIDO2 / WebAuthn)",
    what: "Device-bound passkeys replace password sign-in, keeping the credential private key inside the device platform. Sign-in becomes a biometric or platform unlock instead of a shared secret typed into a form.",
    why: "Phishing, credential stuffing and password reuse stop working as attack classes — there is no password to steal and a lookalike domain cannot complete the ceremony.",
    security: "Provides the possession-plus-inherence factor combination required for strong customer authentication, aligned with the FIDO Alliance trajectory of retiring passwords for high-assurance sectors.",
    feasibility: "NEAR_TERM",
    status: "PLANNED",
    scores: { usefulness: 5, security: 5, feasibility: 4, regulatory: 5 },
  },
  {
    id: "t2-openbanking",
    name: "Open Banking / Open Finance aggregation",
    what: "Read-only aggregation of external accounts and transactions through regulated AISP APIs, surfaced alongside a consent dashboard. Each connection shows its scope, its duration and a one-tap revocation.",
    why: "Balances and spending from every bank sit in one picture, so budgeting and affordability answers cover your whole financial life rather than a single account.",
    security: "Designed for the PSD3/PSR era: explicit scoped consent with periodic re-authorisation, regulated API access only, and no credential-sharing screen scraping.",
    feasibility: "NEAR_TERM",
    status: "PLANNED",
    scores: { usefulness: 5, security: 4, feasibility: 4, regulatory: 5 },
  },
  {
    id: "t2-paybybank",
    name: "Pay-by-Bank rails",
    what: "Instant account-to-account transfers over SEPA Instant or FedNow-style rails, initiated from a request-to-pay message approved in-app. Settlement happens directly between accounts with no card network in the middle.",
    why: "Near-instant settlement without interchange costs, with your own bank authenticating the payment instead of a merchant collecting card details.",
    security: "The request-to-pay payload carries amount, reference and expiry and is signed for approval, which blunts invoice-redirect fraud compared with manual transfers.",
    feasibility: "NEAR_TERM",
    status: "PLANNED",
    scores: { usefulness: 4, security: 4, feasibility: 4, regulatory: 5 },
  },
  {
    id: "t2-networktokens",
    name: "Network token provisioning to wallets",
    what: "Issue-domain verified provisioning of network tokens into Apple Pay and Google Pay from the card management screen. Card controls apply to wallet transactions exactly as they do to the physical card.",
    why: "Tap-to-pay from the phone without carrying the physical card, while freeze, limits and merchant rules keep protecting the wallet credential.",
    security: "Requires issuer domain verification so only the genuine issuer can provision; device-scoped DPANs are revocable independently of the underlying card number.",
    feasibility: "NEAR_TERM",
    status: "PLANNED",
    scores: { usefulness: 4, security: 5, feasibility: 3, regulatory: 4 },
  },
  {
    id: "t2-intl-fx",
    name: "International payments with transparent FX",
    what: "Cross-border payments show an all-in quote before confirmation, split into mid-market rate, provider margin and fixed fees. The final debited amount is locked for the life of the quote window.",
    why: "You see exactly what a transfer costs before committing it, ending the hidden-margin practice of quoting an unfavourable rate as free.",
    security: "Quotes are bound to consent records and executed against the exact quoted terms, consistent with FCA and EU cross-border payment disclosure rules.",
    feasibility: "NEAR_TERM",
    status: "PLANNED",
    scores: { usefulness: 4, security: 4, feasibility: 4, regulatory: 4 },
  },
];

// ---------- Data: Tier 3 — Advanced 2027 ----------

const TIER_3: RoadmapItem[] = [
  {
    id: "t3-ai-insights",
    name: "AI-assisted financial insights",
    what: "An assistant that answers cash-flow forecast and affordability questions grounded strictly in the user's own records, with retrieval and strict PII controls. In this sandbox the identical question set is answered by deterministic, explainable rules instead of a language model.",
    why: "Plain-language answers about what is affordable next month turn raw statements into decisions without waiting for an adviser appointment.",
    security: "A production design would demand PII redaction, per-customer grounding boundaries and auditable model answers; the sandbox keeps the intelligence layer deterministic by design so nothing is claimed that cannot be inspected.",
    feasibility: "NEAR_TERM",
    status: "SIMULATED_DEMO",
    scores: { usefulness: 4, security: 3, feasibility: 3, regulatory: 3 },
  },
  {
    id: "t3-ondevice-fraud",
    name: "Privacy-preserving fraud detection",
    what: "Pattern scoring that runs on the device so raw behavioural and transaction data never leaves it, with only coarse risk outcomes shared onward. The sandbox approximates the pattern today by scoring locally over your own records.",
    why: "Fraud protection that does not require shipping your data to a central model — privacy and protection stop being a trade-off.",
    security: "Keeps raw data inside the trust boundary of the device, consistent with GDPR data-minimisation; the open research question is delivering model updates without leaking training signal.",
    feasibility: "RESEARCH",
    status: "SIMULATED_DEMO",
    scores: { usefulness: 4, security: 5, feasibility: 2, regulatory: 4 },
  },
  {
    id: "t3-biometrics",
    name: "Behavioural biometrics step-up authentication",
    what: "Continuous scoring of typing cadence, pointer movement and interaction rhythm during a session, escalating to a step-up challenge when patterns diverge from the enrolled baseline. It runs invisibly in the background of a normal session.",
    why: "A fraudster holding stolen credentials still behaves differently from you, so challenges fire on behaviour rather than on a correct password alone.",
    security: "Behaviour templates are biometric-adjacent personal data under GDPR Article 9 caution; production use requires explicit consent, on-device template storage and documented false-acceptance testing.",
    feasibility: "RESEARCH",
    status: "PLANNED",
    scores: { usefulness: 3, security: 4, feasibility: 2, regulatory: 4 },
  },
  {
    id: "t3-iso20022",
    name: "Real-time payment attachments and enriched descriptors",
    what: "ISO 20022 remittance and structured reference data travels with real-time payments and renders as structured line items instead of one mangled descriptor. Merchant names, invoice references and remittance fields survive end to end.",
    why: "Reconciliation stops being guesswork: you see who paid what for, and any dispute cites the exact structured reference.",
    security: "Structured fields widen the surface for injection-style social engineering, so every field is validated and escaped at ingestion before rendering.",
    feasibility: "NEAR_TERM",
    status: "PLANNED",
    scores: { usefulness: 3, security: 4, feasibility: 4, regulatory: 4 },
  },
];

// ---------- Data: Tier 4 — Experimental / research ----------

const TIER_4: RoadmapItem[] = [
  {
    id: "t4-pqc",
    name: "Post-quantum cryptography migration readiness",
    what: "Crypto-agility work that inventories long-lived secrets and migrates key exchange and signatures to the NIST post-quantum standards ML-KEM (FIPS 203) and ML-DSA (FIPS 204). The driver is harvest-now, decrypt-later exposure of data that must stay confidential into the 2040s.",
    why: "Mortgage terms, KYC archives and encrypted backups outlive the safety margin of today's RSA and ECC, so early migration avoids a forced emergency rollover later.",
    security: "Transition runs hybrid classical plus post-quantum key establishment, with ongoing review of implementation maturity and side-channel resistance of the new primitives.",
    feasibility: "RESEARCH",
    status: "RESEARCH",
    scores: { usefulness: 3, security: 5, feasibility: 2, regulatory: 3 },
  },
  {
    id: "t4-cbdc",
    name: "CBDC / digital currency integration pilots",
    what: "Integration studies for a retail digital currency ledger on the expected two-tier model, where the bank distributes central-bank money through wallet interfaces. Pilot scope covers programmable settlement and offline payment patterns.",
    why: "If a digital pound or digital euro launches, holding central-bank money inside the same app removes rail fragmentation from daily payments.",
    security: "Carries an elevated regulatory bar across privacy thresholds, holding limits and national security review — the reason regulatory clarity scores 5 even while usefulness is unproven.",
    feasibility: "RESEARCH",
    status: "RESEARCH",
    scores: { usefulness: 3, security: 3, feasibility: 2, regulatory: 5 },
  },
  {
    id: "t4-stablecoin",
    name: "Regulated stablecoin settlement rails",
    what: "Evaluation of regulated stablecoins under MiCA and GENIUS-style regimes as settlement media for specific corridors. Settlement would run only with approved issuers, with redemption parity checks on every transfer.",
    why: "In narrow corridors stablecoin settlement could cut settlement from days to minutes — relevant to marketplace and treasury flows, not to everyday spending.",
    security: "Reserve attestations, issuer redemption quality and custody rules dominate the risk profile; with low retail usefulness today it stays deliberately out of build priorities.",
    feasibility: "RESEARCH",
    status: "RESEARCH",
    scores: { usefulness: 2, security: 3, feasibility: 2, regulatory: 5 },
  },
  {
    id: "t4-did",
    name: "Decentralised identity (W3C DID / verifiable credentials)",
    what: "W3C decentralised identifiers and verifiable credentials let a KYC attestation issued once be re-presented to other relying parties without repeating full onboarding. The bank acts as a trusted issuer of identity credentials.",
    why: "Verify once and reuse everywhere cuts repeated document uploads and the onboarding abandonment that comes with them.",
    security: "Revocation, selective disclosure and wallet security are unsolved at scale, and regulatory acceptance of credential-based KYC under eIDAS 2.0 and EUDI wallets is still maturing.",
    feasibility: "RESEARCH",
    status: "RESEARCH",
    scores: { usefulness: 3, security: 4, feasibility: 2, regulatory: 4 },
  },
];

const TIERS: RoadmapTier[] = [
  {
    id: "tier-1",
    title: "Tier 1 — Essential",
    tagline: "Delivered in this build — every control below genuinely works inside the sandbox today, enforced server-side, not merely displayed.",
    items: TIER_1,
  },
  {
    id: "tier-2",
    title: "Tier 2 — High-Value Next",
    tagline: "Near-term capabilities with settled standards and clear regulation — engineering-ready and queued behind the essentials.",
    items: TIER_2,
  },
  {
    id: "tier-3",
    title: "Tier 3 — Advanced 2027",
    tagline: "Advanced capabilities on the 2027 horizon. Where the sandbox cannot honestly implement one, it is labelled simulated rather than claimed as working.",
    items: TIER_3,
  },
  {
    id: "tier-4",
    title: "Tier 4 — Experimental / Research",
    tagline: "Experimental tracks with unresolved standards, immature tooling or unsettled regulation — monitored and scored, deliberately not built.",
    items: TIER_4,
  },
];

const DIMENSIONS: { label: string; question: string }[] = [
  { label: "Usefulness", question: "Would a customer feel the benefit in ordinary week-to-week money management, not only inside a demo?" },
  { label: "Security", question: "Does the capability raise the security baseline and hold up under attack? Security is never traded away to ship a feature." },
  { label: "Feasibility", question: "Can a small, focused team build and operate it correctly with the standards and tooling available today?" },
  { label: "Regulatory", question: "How settled are the obligations? 5 means clear rules with active supervision; 1 means an unregulated grey zone." },
];

// ---------- Local render helpers ----------

function Chip({ label, cls, className }: { label: string; cls: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0 text-[10px] font-semibold uppercase tracking-wide",
        cls,
        className,
      )}
    >
      {label}
    </span>
  );
}

function Paragraph({ kicker, children }: { kicker: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{kicker}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</span>
        <span className="nb-num text-[10px] font-semibold text-zinc-400">{score}/5</span>
      </div>
      <Progress
        value={(score / 5) * 100}
        aria-label={`${label} ${score} out of 5`}
        className="mt-1.5 h-1.5 bg-muted/70 [&>[data-slot=progress-indicator]]:bg-emerald-400"
      />
    </div>
  );
}

function TierSection({ tier }: { tier: RoadmapTier }) {
  return (
    <SectionCard
      title={tier.title}
      description={tier.tagline}
      actions={<Chip label={`${tier.items.length} items`} cls="border-zinc-500/40 bg-zinc-500/10 text-zinc-400" />}
    >
      <Accordion type="multiple" className="space-y-2">
        {tier.items.map((item) => (
          <AccordionItem
            key={item.id}
            value={item.id}
            className="rounded-lg border border-border/70 bg-muted/20 px-4 last:border-b"
          >
            <AccordionTrigger className="gap-3 py-3.5 hover:no-underline">
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-zinc-100">{item.name}</span>
                <Chip {...STATUS_CHIP[item.status]} />
                <Chip {...FEASIBILITY_CHIP[item.feasibility]} className="hidden sm:inline-flex" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-5">
              <div className="space-y-3">
                <Paragraph kicker="What it is">{item.what}</Paragraph>
                <Paragraph kicker="Why it matters">{item.why}</Paragraph>
                <Paragraph kicker="Security and regulatory">{item.security}</Paragraph>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <ScoreBar label="Usefulness" score={item.scores.usefulness} />
                <ScoreBar label="Security" score={item.scores.security} />
                <ScoreBar label="Feasibility" score={item.scores.feasibility} />
                <ScoreBar label="Regulatory" score={item.scores.regulatory} />
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </SectionCard>
  );
}

// ---------- View ----------

export function RoadmapView() {
  const allItems = TIERS.flatMap((t) => t.items);
  const countByStatus = (status: RoadmapStatus) => allItems.filter((i) => i.status === status).length;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Roadmap — 2027"
        title="Banking Technology Roadmap 2027"
        description="The technology priorities for NEXUS BANK through 2027, evaluated line by line. This roadmap distinguishes what is implemented in this sandbox, what is planned, what is simulated, and what needs further research — nothing fashionable is claimed as working."
        actions={<DemoBadge tooltip="Roadmap content is editorial demo material, not a public commitment" />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Implemented" value={countByStatus("IMPLEMENTED")} sub="Tier 1 — delivered in this build" tone="positive" />
        <StatCard label="Planned" value={countByStatus("PLANNED")} sub="Tier 2–3 — near-term engineering" tone="warning" />
        <StatCard label="Simulated demo" value={countByStatus("SIMULATED_DEMO")} sub="Honest stand-ins, not claimed as working" />
        <StatCard label="Research" value={countByStatus("RESEARCH")} sub="Tier 4 — standards still forming" />
      </div>

      <SectionCard
        title="Evaluation framework"
        description="Every roadmap item is scored 1–5 on usefulness, security, feasibility and regulatory clarity. The scores decide the tier — not the hype cycle."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DIMENSIONS.map((d) => (
            <div key={d.label} className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">{d.label}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{d.question}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3">
          <p className="text-xs leading-relaxed text-amber-300/90">
            <span className="font-semibold">Prioritisation rule:</span> items scoring 5 on both security and regulatory clarity are
            scheduled first — the strong customer authentication, tokenisation and session security tracks, plus passkeys and open
            banking, follow exactly that pattern. Fashionable-but-weak items are explicitly kept out: a capability with a weak
            security posture or unsettled law waits in research regardless of how much attention it is getting.
          </p>
        </div>
      </SectionCard>

      {TIERS.map((tier) => (
        <TierSection key={tier.id} tier={tier} />
      ))}
    </div>
  );
}
