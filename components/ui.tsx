import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, desc, eyebrow }: { title: string; desc?: string; eyebrow?: string }) {
  return (
    <header className="mb-6">
      {eyebrow && <p className="mb-1 text-xs font-semibold tracking-wide text-sage-dark">{eyebrow}</p>}
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
      {desc && <p className="mt-1.5 text-sm leading-relaxed text-warm">{desc}</p>}
    </header>
  );
}

// 중요도에 따라 배경을 구분: plain(기본) < soft(보조 정보) < sage(강조) < dark(최상위)
type CardTone = "plain" | "soft" | "sage" | "dark";
const CARD_TONE: Record<CardTone, string> = {
  plain: "border border-charcoal/8 bg-white",
  soft: "bg-sand",
  sage: "bg-sage-soft",
  dark: "bg-cocoa text-white",
};

export function Card({ children, className = "", tone = "plain" }: { children: ReactNode; className?: string; tone?: CardTone }) {
  return <section className={`rounded-3xl p-5 ${CARD_TONE[tone]} ${className}`}>{children}</section>;
}

export function Badge({ children, tone = "sage" }: { children: ReactNode; tone?: "sage" | "gray" | "dark" }) {
  const cls = tone === "sage" ? "bg-sage/25 text-sage-dark" : tone === "dark" ? "bg-cocoa text-white" : "bg-charcoal/8 text-warm";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

export const NotReady = () => <Badge tone="gray">미구현</Badge>;

const btn = "inline-flex min-h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";
export const btnPrimary = `${btn} bg-sage-dark text-white hover:bg-sage-dark/90`;
export const btnSecondary = `${btn} border border-charcoal/15 bg-white/70 text-charcoal hover:bg-white`;
export const btnLarge = "min-h-14 px-7 text-base";

export function LinkButton({ href, children, primary, className = "" }: { href: string; children: ReactNode; primary?: boolean; className?: string }) {
  return (
    <Link href={href} className={`${primary ? btnPrimary : btnSecondary} ${className}`}>
      {children}
    </Link>
  );
}

export function ProgressBar({ value, tone = "sage", className = "" }: { value: number; tone?: "sage" | "dark"; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className={`h-3 w-full overflow-hidden rounded-full bg-charcoal/10 ${className}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all ${tone === "dark" ? "bg-cocoa" : "bg-olive-deep"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function BackLink({ href = "/daily", children = "중국어 학습" }: { href?: string; children?: ReactNode }) {
  return (
    <Link href={href} className="mb-3 inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-warm hover:text-charcoal">
      <span aria-hidden>←</span> {children}
    </Link>
  );
}

// 선택지 버튼 공통 상태 스타일 (퀴즈/듣기)
export function choiceClass(state: "idle" | "correct" | "wrong" | "dim") {
  const base = "flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-base font-medium transition";
  const t = {
    idle: "border-charcoal/10 bg-white hover:border-sage-dark/50 active:scale-[0.99]",
    correct: "border-sage-dark bg-sage-soft",
    wrong: "border-charcoal bg-sand",
    dim: "border-transparent bg-white/50 opacity-50",
  }[state];
  return `${base} ${t}`;
}
