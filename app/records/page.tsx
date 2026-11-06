"use client";
import { Icon, type IconName } from "@/components/Icons";
import { CalendarCard, DataCard, GrowthCard, ReviewCard, SettingsCard } from "@/components/RecordsParts";
import { Badge, Card, LinkButton, PageHeader, ProgressBar } from "@/components/ui";
import { getLevelInfo } from "@/lib/character";
import { SAMPLE_STATUS } from "@/lib/data";
import { DAILY_WORDS } from "@/lib/dailyData";
import { EMPTY_PLACEMENT, ALL_WORDS, type PlacementRecord } from "@/lib/placement";
import { computeStats, maxStreak, type ListenRec } from "@/lib/recordStats";
import { useDaily } from "@/lib/useDaily";
import { useLocalState } from "@/lib/useLocalState";

const TOTAL_WORDS = ALL_WORDS.length + DAILY_WORDS.length; // 기존 예시 단어 + 일일 학습 단어 은행

export default function RecordsPage() {
  const [xp] = useLocalState("examfit.xp", SAMPLE_STATUS.xp);
  const [words] = useLocalState<Record<string, string>>("examfit.words", {});
  const [listening] = useLocalState<Record<string, ListenRec>>("examfit.listening", {});
  const [course] = useLocalState("examfit.course", { name: "", examDate: "" });
  const [place, setPlace, placeReady] = useLocalState<PlacementRecord>("examfit.placement", EMPTY_PLACEMENT);
  const { store, setStore, ready } = useDaily();

  const stats = computeStats(store, words, listening);
  const plays = Object.values(listening).reduce((a, r) => a + r.plays, 0);
  const dday = course.examDate ? Math.ceil((new Date(course.examDate).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
  const rate = stats.listening.rate ?? 0;

  return (
    <>
      <PageHeader title="내 학습 기록" desc="핏찹이와 쌓아 온 학습 성과와 설정이에요." />

      <div className="space-y-4">
        {/* 1. 캐릭터 성장 */}
        <GrowthCard xp={xp} stats={stats} maxStreakDays={maxStreak(stats.daySet)} />

        {/* 2. 주요 학습 통계 */}
        {ready && !stats.hasAny && <p className="rounded-2xl bg-sand px-4 py-3 text-sm text-warm">아직 기록이 없어요. 일상 중국어 학습을 시작하면 여기에 쌓여요.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <Stat icon="words" title="누적 학습 단어">
            <p className="text-3xl font-extrabold">
              {stats.learnedWords}
              <span className="text-base font-semibold text-warm">개 학습</span>
            </p>
            <p className="mt-1 text-xs text-warm">그중 ‘외웠어요’ {stats.knownWords}개 · 전체 단어 {TOTAL_WORDS}개 중</p>
            <ProgressBar value={Math.min(1, stats.knownWords / TOTAL_WORDS)} className="mt-2" />
            {stats.learnedWords === 0 && <Empty>단어 카드에서 학습을 시작하면 쌓여요</Empty>}
          </Stat>

          <Stat icon="check" title="듣기 퀴즈 정답률">
            {stats.listening.tried ? (
              <div className="flex items-center gap-4">
                <div className="relative h-20 w-20 shrink-0 rounded-full" style={{ background: `conic-gradient(var(--color-sage-dark) ${rate * 360}deg, rgb(41 39 36 / 0.1) 0)` }} role="img" aria-label={`정답률 ${Math.round(rate * 100)}%`}>
                  <div className="absolute inset-2 flex items-center justify-center rounded-full bg-white text-lg font-extrabold">{Math.round(rate * 100)}%</div>
                </div>
                <p className="text-sm text-warm">
                  {stats.listening.tried}문제 중 <b className="text-charcoal">{stats.listening.correct}문제</b> 정답
                </p>
              </div>
            ) : (
              <Empty>아직 푼 듣기 퀴즈가 없어요</Empty>
            )}
            <p className="mt-2 text-xs text-warm">재생 {plays}회 · 재생 횟수는 숙달 지표가 아니에요</p>
          </Stat>

          <Stat icon="speaking" title="회화 학습">
            <p className="text-3xl font-extrabold">
              {stats.studiedSentences}
              <span className="text-base font-semibold text-warm">문장 학습</span>
            </p>
            {stats.speaking.answered ? (
              <p className="mt-1 text-xs text-warm">
                최종 퀴즈 {stats.speaking.answered}문제 중 <b className="text-charcoal">{stats.speaking.correct}문제</b> 정답
              </p>
            ) : (
              <Empty>회화 퀴즈 기록이 아직 없어요</Empty>
            )}
          </Stat>

          <Stat icon="writing" title="한자 쓰기">
            <p className="text-3xl font-extrabold">
              {stats.writing.learned}
              <span className="text-base font-semibold text-warm">자 학습</span>
            </p>
            {stats.writing.tried ? (
              <p className="mt-1 text-xs text-warm">
                최종 쓰기 {stats.writing.tried}자 중 <b className="text-charcoal">{stats.writing.passed}자</b> 통과 · 오답 {stats.writing.tried - stats.writing.passed}자
              </p>
            ) : (
              <Empty>한자 쓰기 퀴즈 기록이 아직 없어요</Empty>
            )}
          </Stat>

          <Stat icon="course" title="연속 학습">
            <p className="text-3xl font-extrabold">
              {stats.streak}
              <span className="text-base font-semibold text-warm">일 연속</span>
            </p>
            <p className="mt-1 text-xs text-warm">
              오늘 완료 단계 {stats.todayDone}개 · 이번 주 {stats.weekDays}/7일 · 완료한 일일 학습 {stats.completedSessions}회
            </p>
            {stats.days.size === 0 && <Empty>단계를 끝까지 완료하면 학습한 날로 기록돼요</Empty>}
          </Stat>

          <Stat icon="exam" title="등록 과목">
            {course.name ? (
              <div className="flex items-center justify-between gap-3">
                <p className="break-words text-xl font-bold">{course.name}</p>
                {dday !== null && <Badge tone="dark">{dday > 0 ? `D-${dday}` : dday === 0 ? "D-Day" : `D+${-dday}`}</Badge>}
              </div>
            ) : (
              <>
                <Empty>등록한 과목이 없어요</Empty>
                <div className="mt-3">
                  <LinkButton href="/exam">시험 대비에서 등록</LinkButton>
                </div>
              </>
            )}
          </Stat>
        </div>

        {/* 3. 학습 달력 */}
        <CalendarCard stats={stats} charImage={getLevelInfo(xp).current.image} />

        {/* 4. 복습 목록 */}
        <ReviewCard stats={stats} />

        {/* 5. 중국어 실력 설정 */}
        {placeReady && <SettingsCard place={place} setPlace={setPlace} />}

        {/* 6. 데이터 백업·초기화 */}
        {ready && <DataCard store={store} setStore={setStore} setPlace={setPlace} />}
      </div>

      <p className="mt-6 text-center text-[11px] text-warm">기록은 이 기기의 브라우저에 저장돼요. 기기 간 자동 동기화는 지원하지 않아요(백업 파일로 옮길 수 있어요). 계정, 취약점 분석은 아직 구현되지 않았어요.</p>
    </>
  );
}

function Stat({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <Card tone="plain">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-warm">
        <Icon name={icon} className="h-4 w-4 text-sage-dark" /> {title}
      </h2>
      {children}
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 rounded-2xl bg-sand px-3 py-2 text-sm text-warm">{children}</p>;
}
