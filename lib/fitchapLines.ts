// 핏찹이 대사(고정 메시지, AI 호출 없음). 약간 무표정하고 능청스러운 말투. 같은 이벤트도 여러 문장을 돌려 쓴다.
export type FitchapEvent =
  | "words.start" | "words.quizDone"
  | "listening.start" | "listening.correct" | "listening.wrong"
  | "speaking.start" | "speaking.quizDone"
  | "writing.start" | "writing.charDone"
  | "daily.complete"
  | "speak.start" | "speak.ok" | "speak.retry" | "speak.fail"
  | "oral.start" | "oral.asking" | "oral.listening" | "oral.evaluating" | "oral.correct" | "oral.wrong" | "oral.unclear" | "oral.end";

export const LINES: Record<FitchapEvent, string[]> = {
  "words.start": ["오늘도 왔네. 시작하자.", "단어부터. 천천히 봐도 돼.", "자, 첫 카드부터 가볼까."],
  "words.quizDone": ["퀴즈까지 끝냈네. 꽤 하는데?", "오. 여기까지 왔어. 다음은 듣기야.", "틀린 건 복습 목록에 있어. 걱정 마."],
  "listening.start": ["이제 귀를 열어볼까.", "잘 들어. 두 번 들어도 안 뭐라 해.", "듣기 시간. 소리에 집중."],
  "listening.correct": ["오. 이건 좀 하는데?", "정답. 귀가 좋네.", "음, 그렇지."],
  "listening.wrong": ["괜찮아. 다시 보면 되지.", "아깝다. 다음에 또 나와.", "틀려도 돼. 그래서 연습하는 거야."],
  "speaking.start": ["문장 시간이야. 소리 내서 따라 해봐.", "이번엔 문장. 입으로 해야 남아.", "천천히 읽어도 돼. 시간은 많아."],
  "speaking.quizDone": ["문장 퀴즈 끝. 수고했어.", "오, 다 풀었네. 이제 한자야.", "틀린 문장은 목록에 넣어뒀어."],
  "writing.start": ["획순 연습이야. 천천히 한 획씩.", "자, 이번엔 네 차례.", "손부터 풀자. 한 획씩."],
  "writing.charDone": ["오. 한 글자 완성.", "획순 좋은데? 다음 글자 가자.", "괜찮네. 손이 기억할 거야."],
  // 따라 말하기(마이크): 지정 문구 하나씩만 사용
  "speak.start": ["자, 이번엔 네 차례."],
  "speak.ok": ["오. 잘 말했는데?"],
  "speak.retry": ["다시 한번 해보자."],
  "speak.fail": ["잘 안 들렸어. 다시 해볼래?"],
  "daily.complete": ["오늘도 해냈네. 내일 보자.", "다 끝냈어. 오늘은 푹 쉬어.", "수고했어. 나도 좀 뿌듯하다."],
  "oral.start": ["준비되면 시작하자. 떨 필요 없어.", "마이크 켜고, 편하게 말하면 돼.", "교수님 앞이야. 그래도 난 네 편."],
  "oral.asking": ["질문 잘 들어봐.", "집중. 곧 네 차례야.", "들으면서 답을 생각해 둬."],
  "oral.listening": ["듣고 있어. 천천히 말해도 돼.", "자, 이번엔 네 차례.", "말해봐. 기다릴게."],
  "oral.evaluating": ["잠깐, 교수님이 생각 중이야.", "결과 기다리는 중. 숨 한번 쉬어.", "조금만 기다려 봐."],
  "oral.correct": ["오. 이건 좀 하는데?", "좋아. 방금 거 괜찮았어.", "음, 잘했네."],
  "oral.wrong": ["괜찮아. 다시 하면 되지.", "아깝다. 한 번 더 해보자.", "틀릴 수도 있지. 다시 가자."],
  "oral.unclear": ["잘 안 들렸나 봐. 다시 한 번.", "다시 말해줘. 횟수는 안 깎여."],
  "oral.end": ["수고했어. 결과 한번 보자.", "끝까지 했네. 그게 중요해.", "오늘은 여기까지. 잘했어."],
};

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

// seed가 바뀌면 다른 문장이 나올 수 있게 고르고, 직전 문장(prev)과는 겹치지 않게 한다.
export function pickLine(event: FitchapEvent, seed: string | number, prev?: string): string {
  const pool = LINES[event];
  let i = hash(`${event}:${seed}`) % pool.length;
  if (pool.length > 1 && pool[i] === prev) i = (i + 1) % pool.length;
  return pool[i];
}
