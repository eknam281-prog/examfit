// 개발용 예시 데이터. 추후 Supabase(study_items 등)로 교체한다.
export type Word = { id: string; hanzi: string; pinyin: string; meaning: string; example: string; examplePinyin: string; exampleMeaning: string };

export const SAMPLE_WORDS: Word[] = [
  { id: "w1", hanzi: "你好", pinyin: "nǐ hǎo", meaning: "안녕하세요", example: "你好,很高兴认识你。", examplePinyin: "Nǐ hǎo, hěn gāoxìng rènshi nǐ.", exampleMeaning: "안녕하세요, 만나서 반갑습니다." },
  { id: "w2", hanzi: "谢谢", pinyin: "xièxie", meaning: "감사합니다", example: "谢谢你的帮助。", examplePinyin: "Xièxie nǐ de bāngzhù.", exampleMeaning: "도와주셔서 감사합니다." },
  { id: "w3", hanzi: "学生", pinyin: "xuésheng", meaning: "학생", example: "我是大学生。", examplePinyin: "Wǒ shì dàxuéshēng.", exampleMeaning: "저는 대학생입니다." },
  { id: "w4", hanzi: "咖啡", pinyin: "kāfēi", meaning: "커피", example: "我想喝一杯咖啡。", examplePinyin: "Wǒ xiǎng hē yì bēi kāfēi.", exampleMeaning: "저는 커피 한 잔 마시고 싶어요." },
  { id: "w5", hanzi: "图书馆", pinyin: "túshūguǎn", meaning: "도서관", example: "我们在图书馆见面吧。", examplePinyin: "Wǒmen zài túshūguǎn jiànmiàn ba.", exampleMeaning: "우리 도서관에서 만나요." },
];

export type ListeningItem = { id: string; hanzi: string; pinyin: string; meaning: string; source: "기본 예시" };
export const SAMPLE_LISTENING: ListeningItem[] = [
  { id: "l1", hanzi: "你今天有课吗?", pinyin: "Nǐ jīntiān yǒu kè ma?", meaning: "오늘 수업 있어요?", source: "기본 예시" },
  { id: "l2", hanzi: "我想点一杯拿铁。", pinyin: "Wǒ xiǎng diǎn yì bēi nátiě.", meaning: "라테 한 잔 주문하고 싶어요.", source: "기본 예시" },
  { id: "l3", hanzi: "请问,图书馆怎么走?", pinyin: "Qǐngwèn, túshūguǎn zěnme zǒu?", meaning: "실례지만 도서관은 어떻게 가나요?", source: "기본 예시" },
  { id: "l4", hanzi: "周末我们一起去吃饭吧。", pinyin: "Zhōumò wǒmen yìqǐ qù chīfàn ba.", meaning: "주말에 같이 밥 먹으러 가요.", source: "기본 예시" },
];

// 홈 대시보드용 예시 상태 (실제 기록 아님)
export const SAMPLE_STATUS = { xp: 135, streakDays: 3, todayMinutes: 12, goalMinutes: 20 };

export type SampleQuestion = { id: string; type: string; stem: string; choices: string[]; correctIndex: number; explanation: string };

// 풀이 화면 동작 확인용 고정 예시. AI가 만든 문제가 아니다.
export const SAMPLE_EXAM_QUESTIONS: SampleQuestion[] = [
  { id: "q1", type: "한자↔뜻", stem: "다음 중 '도서관'을 뜻하는 단어는?", choices: ["咖啡", "学生", "图书馆", "谢谢", "你好"], correctIndex: 2, explanation: "图书馆(túshūguǎn)은 '도서관'입니다." },
  { id: "q2", type: "한자↔병음", stem: "'谢谢'의 올바른 병음은?", choices: ["xièxie", "kāfēi", "nǐ hǎo", "xuésheng", "túshūguǎn"], correctIndex: 0, explanation: "谢谢의 병음은 xièxie (경성 포함)입니다." },
];
