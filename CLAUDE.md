# EXAMFIT

명세서 `EXAMFIT_FINAL_CHINESE_CUSTOM_DAILY_ROUTINE.md`가 최우선. 중국어 전공 전용(영어·일본어 제외).

- 승인 필요: 유료 API, Supabase 스키마/RLS, 배포, GitHub push, 파괴적 변경
- API 키는 서버 환경변수만(`.env.local`, 커밋 금지). 미구현 기능을 완료로 표시하지 않기
- AI 호출은 최소화·캐싱. 크레딧 잔액 확인 불가 시 추측하지 말고 사용자에게 질문
- 캐릭터 PNG(`characters/`, `public/characters/`)는 원본 유지
- 작업 후 `PROGRESS.md` 갱신, `npm run typecheck && npm run build` 확인
