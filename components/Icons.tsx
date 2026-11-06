import type { ReactNode } from "react";

const P: Record<string, ReactNode> = {
  words: <><rect x="4" y="5" width="16" height="14" rx="3" /><path d="M9 10h6M9 14h3" /></>,
  listening: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></>,
  speaking: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 10h8" /></>,
  writing: <><path d="M4 20l1-4L16 5l3 3L8 19z" /><path d="M14 7l3 3" /></>,
  review: <><path d="M4 12a8 8 0 0 1 14-5l2 2" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-14 5l-2-2" /><path d="M4 20v-5h5" /></>,
  exam: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h5" /></>,
  course: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  play: <path d="M8 5v14l11-7z" />,
  pause: <><path d="M8 5v14" /><path d="M16 5v14" /></>,
  repeat: <><path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3" /><path d="M20 13v2a3 3 0 0 1-3 3H5l3 3" /></>,
  prev: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  file: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 20h14" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  chart: <path d="M5 20V10M12 20V4M19 20v-7" />,
};

export type IconName = keyof typeof P;

export function Icon({ name, className = "h-5 w-5", fill = false }: { name: IconName; className?: string; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[name]}
    </svg>
  );
}
