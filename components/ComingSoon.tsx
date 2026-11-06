import Image from "next/image";
import { BackLink, Badge, Card, LinkButton, PageHeader } from "./ui";
import { Icon, type IconName } from "./Icons";

// 미구현 기능 안내. 동작하는 것처럼 보이는 인터랙션은 두지 않는다.
export function ComingSoon({ title, icon, purpose, steps, note }: { title: string; icon: IconName; purpose: string; steps: string[]; note: string }) {
  return (
    <>
      <BackLink />
      <PageHeader title={title} desc={purpose} />
      <Card tone="sage" className="flex flex-col items-center gap-5 p-6 text-center md:flex-row md:text-left">
        <Image src="/characters/level-1.png" alt="핏찹이" width={120} height={120} unoptimized className="h-28 w-28 shrink-0 rounded-full bg-white/60 p-2" />
        <div>
          <Badge tone="gray">준비 중</Badge>
          <p className="mt-2 text-lg font-bold">핏찹이가 열심히 준비하고 있어요</p>
          <p className="mt-1 text-sm text-warm">{note}</p>
        </div>
      </Card>
      <Card tone="soft" className="mt-4">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Icon name={icon} className="h-5 w-5 text-sage-dark" /> 이런 학습이 만들어질 예정이에요
        </h2>
        <ol className="mt-3 space-y-2">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-charcoal/10 text-xs font-bold text-warm">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </Card>
      <div className="mt-5">
        <LinkButton href="/daily" primary className="w-full md:w-auto">
          지금 가능한 학습 보기
        </LinkButton>
      </div>
    </>
  );
}
