# PROGRESS

## 완료 (2026-11-05, 1차)
- Next.js(App Router)+TS+Tailwind v4 기반, 반응형 레이아웃(모바일 하단 내비/데스크톱 사이드바), 로딩·오류·404
- 홈: 오늘 학습(예시 데이터), 핏찹이 Lv.1~4 이미지·경험치, 모드 ON/OFF(localStorage)
- 일상 중국어: 단어 카드(예시 5개), 듣기(브라우저 TTS, 반복·속도·표시 토글·듣고 뜻 고르기), 일일 코스(시간 선택·배분·미리보기)
- 시험 대비: 과목 등록(localStorage), PDF 선택 UI, 문제 설정 UI, 고정 예시 문제 풀이/채점
- `POST /api/exam/generate` → 501 (자리만)

## 미구현
- PDF 추출·페이지 검수·확정, AI 문제 생성/검증, 취약점·커버리지 분석, 재출제, 정리본
- 코스 타이머·일시정지·이어하기, 회화, 한자 획순, 스캔/손글씨, Supabase 인증·DB, 연속 학습 일수 실제 집계

## 테스트
- `tsc --noEmit` 통과, `next build` 통과, `next start`에서 전 경로 HTTP 200 / 미존재 404 / API 501
- 미검증: 브라우저 렌더링·모바일 실제 화면, TTS 실제 소리(중국어 음성 유무는 기기별), 접근성 도구

## 비고
- 경험치 구간(0/100/300/600)과 문제 수 상한(30)은 임시 값. 명세서에 수치 없음.

## UI/UX 리디자인 1차
- 홈 대시보드 재구성(핏찹이+학습 현황 통합, 성장 단계 컴팩트화), 공통 UI(Card tone/Badge/Button/ProgressBar/Nav/PageHeader) 통일. 기능·데이터 구조 변경 없음. typecheck/build 통과.

## UI/UX 리디자인 2차 (홈 제외 전체 페이지)
- 학습 메인(경로형), 단어(몰입 카드), 듣기(플레이어형), 코스(시각 설정+요약), 시험 대비(4단계 워크플로+퀴즈 결과), 회화/한자(ComingSoon), 기록 대시보드. 로직·데이터·라우트 변경 없음. 공통: Icons, ComingSoon, choiceClass, BackLink 추가. typecheck/build 통과.

## 3차 1단계
- 브랜드 컬러(Cream/Cocoa/Olive/Sand/Ink) 토큰 교체, 중국어 학습 메인을 지그재그 학습 경로로 재구성. typecheck/build 통과.

## PDF 텍스트 추출·검수
- pdfjs-dist 추가. 브라우저에서 페이지별 추출, IndexedDB 저장(examfit-materials), 페이지별 미리보기·수정·검수 완료·확정. 워커/cMap/폰트는 public/pdfjs 복사본 사용. OCR·AI 생성 미구현. typecheck/build 통과, 브라우저 UI 검증은 미실시.

- PDF 검수 UI: 좌우 2열 제거, 원본 페이지 단일 열 열람 + 추출 텍스트 검수 패널(데스크톱 우측 드로어/모바일 바텀시트). 데이터 구조 변경 없음.

- PDF 자동 처리: 업로드 즉시 추출+자동 품질 점검(lib/pdfQuality.ts), 결과 요약 A/B/C 분기, 검수 화면은 "상세 확인"으로 이동, 문제 생성용 자료 선택 로직(lib/materials.ts, 아직 미연동). 기존 IndexedDB 데이터 보존(품질은 읽을 때 계산).

- AI 예상문제 MVP: lib/generate.ts(선택·프롬프트·검증), /api/exam/generate(서버 호출, 설정 없으면 503), 시험 대비 생성 버튼·풀이 연결. FactChat 설정 미확인으로 실제 호출 미수행.

- FactChat 연결: .env.local(키 gitignore됨), 게이트웨이 /chat/completions/ 확인(문서). 실제 1회 호출 성공(문제 3개, 검증 통과 3/3).

- FactChat 연결: .env.local(gitignore됨), 게이트웨이 /chat/completions/ 확인(공식 문서). 실제 1회 호출 성공(문제 3개, 검증 통과 3/3).

- 풀이 화면: AI 생성 문제만 표시(고정 문제 폴백 제거, 개발 모드에서만 데모), 결과 화면에 정답·해설·출처 목록 추가.

- 생성 설정 반영: 문제 유형·출제 방식(서술형이면 단답·서술형)을 서버 프롬프트와 유형별 검증에 반영, 풀이 화면에 서술형 답안 입력(자동 채점 없음). 모의 서버로 검증, 실제 API 호출 없음.

- 문제 수 자유 설정(1~100)·전체 페이지 청크·배치 생성: planJob(lib/generate.ts), 확인 단계 후 순차 호출, 부분 성공 보존, 중복·유사 제거, 서버 호출 한도. 모의 서버로만 검증(실제 API 0회).

- AI 구술시험: 말하기 유형 생성(mode=oral), 음성 세션 토큰 라우트(/api/exam/oral/session, FACTCHAT_REALTIME_MODEL), OralSession 컨트롤러(문제당 3회 제한), BrowserTransport, OralExam UI. 모의 이벤트로만 검증(실제 음성 API 0회).

- 스캔 PDF 비전 OCR: 텍스트 없는 페이지 감지→사용자 승인→/api/exam/ocr(FACTCHAT_VISION_MODEL, 페이지당 1회 순차)→AI 인식·미검수로 IndexedDB 저장, 승인/확정 후에만 문제 생성에 사용. 모의 응답으로만 검증(실제 API 0회).

- OCR 자동 점검(assessOcrText): 사용 가능=자동 포함, 확인 권장=승인/수정·확정 후, 실패=제외. 모의 데이터로만 검증.

- 구술시험 판정 안전장치: 평가에 heard·confidence·fact_mismatches 추가, reconcileEvaluation(숫자·시간·인원 대조, 인식 불확실 시 재확인). 모의 데이터 검증.

- 구술시험 피드백 흐름: 한국어 음성·텍스트 교정, 재시도 중 모범답안·병음 비공개, 완료 시 한자·병음·한국어 뜻 + 정답 듣기(중국어 음성). 모의 검증.

- 일상 중국어 최초 실력 진단(lib/placement.ts, components/Placement.tsx): 자기 평가→5문제→추천 시작 수준(수락/변경), examfit.placement 저장, 단어 수준별 세트, 학습 경로 라벨·점선 겹침 수정(lib/pathLayout.ts). AI 호출 없음.

- 일상 중국어 통합 학습: 일일 세션(lib/daily.ts, examfit.daily)·단계 잠금·단어 수 설정(4~100, 데이터 64개 한도)·회화 문장=ceil(단어/2)·회화 퀴즈·한자 쓰기(hanzi-writer + 제출 후 판정 lib/strokeMatch.ts). 데이터는 lib/dailyData.ts 고정 은행. AI 호출 없음.

- 기록·설정 확장: 성장·통계·달력·복습·실력 설정·백업/복원·3단계 초기화(lib/recordStats.ts, lib/backup.ts, lib/idbTools.ts, components/RecordsParts.tsx). 단계 완료 시각(doneAt) 기록 추가. AI 호출 없음.

- 오늘의 학습 코스에 4. 단어 수·5. 회화 주제 추가, 시작 버튼이 기존 createSession 호출(저장 확인 후 /daily 이동). /daily 별도 설정 화면 제거(코스로 안내). coursePlan에 wordCount/topic 선택 필드.

- 핏찹이 학습 동반자: FitchapBubble(점선 말풍선·고정 대사 lib/fitchapLines.ts), 단어·듣기·회화·한자·완료·구술시험 화면에 이벤트별 등장, 캐릭터 이름 설정(examfit.fitchapName, 백업 허용 키 추가).

- 핏찹이 이름 짓기: NameGate(레이아웃, 이름 없을 때만 1회), lib/fitchapName.ts(검증·저장·동기화), 기록 화면 이름 변경, 홈·일상 헤더에 이름 표시. 이름 키만 사용(다른 데이터 불변).

- 서술형 보완 피드백: /api/exam/feedback(FACTCHAT 재사용, 사용자 클릭 시 1회 호출), lib/feedback.ts 검증, AnswerFeedback 컴포넌트. 모의 응답으로만 검증(실제 AI 호출 0회).

- 회화 따라 말하기 음성 인식: Web Speech API(zh-CN) SpeechController, compareSpeech 글자 비교(점수 없음), SpeakPractice, spoken(ok/skipped) 기록, 핏찹이 지정 문구. FactChat STT 미사용·모의 검증.

- 한자 따라 쓰기: CharSound(발음 듣기·반복 3초·속도, lib/charSpeech.ts LoopSpeaker), 필기선 표시 두께 +30%(HanziPad 7→9, Hanzi Writer drawingWidth 4→5.2). 판정·좌표·최종 퀴즈 힌트 정책 불변.

- 최종 안정성 점검: 단어·듣기 XP 연타 중복 방지(ref), 획순 데이터 로드 실패 시 한자 단계 건너뛰기, ?retake 주소 정리. 432개 조합 시뮬레이션 통과.
