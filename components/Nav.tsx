"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

const ITEMS = [
  { href: "/", label: "홈", match: (p: string) => p === "/", icon: icon(<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />) },
  { href: "/exam", label: "시험 대비", match: (p: string) => p.startsWith("/exam"), icon: icon(<><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h5" /></>) },
  { href: "/daily", label: "중국어 학습", match: (p: string) => p.startsWith("/daily"), icon: icon(<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M9 8h6" /></>) },
  { href: "/records", label: "기록·설정", match: (p: string) => p.startsWith("/records"), icon: icon(<path d="M5 20V10M12 20V4M19 20v-7" />) },
];

function Logo() {
  return (
    <Link href="/" className="text-xl font-extrabold tracking-tight">
      EXAM<span className="text-sage-dark">FIT</span>
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center bg-ivory/90 px-5 backdrop-blur md:hidden">
        <Logo />
      </header>
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col bg-sand p-4 md:flex">
        <div className="mb-8 px-3 pt-2">
          <Logo />
        </div>
        <nav className="flex flex-col gap-1" aria-label="주 메뉴">
          {ITEMS.map((it) => {
            const on = it.match(pathname);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={on ? "page" : undefined}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${on ? "bg-sage-dark text-white" : "text-charcoal/70 hover:bg-charcoal/5"}`}
              >
                {it.icon}
                {it.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-charcoal/8 bg-ivory/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="주 메뉴">
        {ITEMS.map((it) => {
          const on = it.match(pathname);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={on ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${on ? "text-sage-dark" : "text-warm"}`}
            >
              <span className={`flex h-7 w-12 items-center justify-center rounded-full transition ${on ? "bg-sage/25" : ""}`}>{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
