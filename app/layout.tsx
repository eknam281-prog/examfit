import type { Metadata, Viewport } from "next";
import { NameGate } from "@/components/NameGate";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "EXAMFIT — 중국어 전공 학습·시험 대비",
  description: "중국어 전공 대학생을 위한 일상 학습과 맞춤 시험 대비 웹앱",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="font-sans antialiased">
        <NameGate>
        <Nav />
        <main className="mx-auto max-w-4xl px-4 pb-28 pt-2 md:pt-8 md:ml-56 md:max-w-none md:px-10 md:pb-10">
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>
        </NameGate>
      </body>
    </html>
  );
}
