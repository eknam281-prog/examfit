"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { btnLarge, btnPrimary } from "./ui";
import { getLevelInfo } from "@/lib/character";
import { DEFAULT_NAME, NAME_MAX, useFitchapName, validateName } from "@/lib/fitchapName";

// 이름이 아직 없을 때 한 번만 보이는 이름 짓기 화면. 이름만 저장하고 다른 학습 데이터는 읽기만 한다(삭제·초기화 없음).
// 이름이 저장되면(또는 저장 실패 시 '저장 없이 계속하기') 사라지므로 반복 표시·리다이렉트 루프가 없다.
export function NameGate({ children }: { children: ReactNode }) {
  const { name, ready, save } = useFitchapName();
  const router = useRouter();
  const [text, setText] = useState(DEFAULT_NAME);
  const [err, setErr] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [passed, setPassed] = useState(false); // 저장 실패 시 이번 방문에서만 통과

  if (ready && (name || passed)) return <>{children}</>;

  // 로딩 중에는 앱 내용이 잠깐 비치지 않도록 같은 배경만 보여 준다.
  if (!ready) return <div className="fixed inset-0 z-50 bg-ivory" aria-hidden />;

  // 기존 사용자는 저장된 XP에 맞는 캐릭터를, 신규 방문자는 Lv.1 이미지를 보여 준다.
  let rawXp: string | null = null;
  try {
    rawXp = localStorage.getItem("examfit.xp");
  } catch {
    /* 저장소를 읽지 못하면 신규 방문자로 본다 */
  }
  const xp = rawXp !== null && Number.isFinite(Number(rawXp)) ? Number(rawXp) : 0;
  const level = getLevelInfo(xp).current;
  const hasData = (() => {
    try {
      return ["examfit.xp", "examfit.words", "examfit.listening", "examfit.daily", "examfit.course", "examfit.placement"].some((k) => localStorage.getItem(k) !== null);
    } catch {
      return false;
    }
  })();
  const len = Array.from(text.trim()).length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = save(text);
    if (!r.ok) {
      setErr(r.message);
      setFailed(!validateName(text).ok ? false : true); // 형식 오류가 아니라 저장 자체가 실패한 경우에만 '저장 없이 계속' 제공
      return;
    }
    setErr(null);
    // 완전히 새로운 방문자만 이어서 중국어 실력 진단(일상 중국어 탭의 기존 진입 조건)으로 안내한다. 기존 사용자는 있던 화면 그대로.
    if (!hasData) router.push("/daily");
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ivory px-4 py-8">
      <form onSubmit={submit} className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center text-center">
        <Image src={hasData ? level.image : "/characters/level-1.png"} alt="핏찹이" width={160} height={160} unoptimized priority className="anim-bob h-36 w-36 rounded-full bg-sage-soft p-3" />
        <h1 className="mt-5 text-2xl font-bold tracking-tight">함께 성장할 친구의 이름을 지어주세요.</h1>
        <p className="mt-1.5 text-sm text-warm">{hasData ? "학습 기록과 경험치는 그대로예요. 이름만 정하면 돼요." : "공부할수록 핏찹이도 같이 자라요."}</p>

        <label className="mt-5 w-full text-left text-sm font-semibold" htmlFor="fit-name">
          캐릭터 이름
        </label>
        <input
          id="fit-name"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setErr(null);
          }}
          autoComplete="off"
          autoFocus
          aria-invalid={!!err}
          aria-describedby="fit-name-help"
          className="mt-1.5 min-h-12 w-full rounded-2xl border border-charcoal/20 bg-white px-4 text-center text-lg font-bold"
        />
        <p id="fit-name-help" className={`mt-1 w-full text-right text-xs ${len > NAME_MAX ? "font-semibold text-charcoal" : "text-warm"}`}>
          {len}/{NAME_MAX}
        </p>
        {err && (
          <p role="alert" className="mt-2 w-full rounded-2xl bg-sand p-3 text-left text-sm font-medium">
            ⚠ {err}
          </p>
        )}

        <button type="submit" className={`${btnPrimary} ${btnLarge} mt-4 w-full`}>
          이 이름으로 시작하기
        </button>
        {failed && (
          <button type="button" onClick={() => setPassed(true)} className="mt-3 min-h-11 text-sm font-semibold text-warm underline">
            저장 없이 계속하기(이번 방문만)
          </button>
        )}
        <p className="mt-4 text-[11px] leading-relaxed text-warm">이름은 이 브라우저에만 저장돼요. 로그인이 없어서 다른 기기나 브라우저와 자동으로 동기화되지 않아요. 기록 화면에서 언제든 바꿀 수 있어요.</p>
      </form>
    </div>
  );
}
