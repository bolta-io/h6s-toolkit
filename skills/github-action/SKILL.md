---
name: github-action
description: bolta-io/h6s-action 으로 한국 금융 데이터를 GitHub Actions cron 에 묶어 정기 수집하는 패턴 카탈로그. 사용자가 "github action", "워크플로우", "cron 수집", "정기 수집", "yml", "PR 자동 생성", "CI 에서 h6s", "스케줄 수집" 같은 키워드로 자동화 요청을 할 때 자동 적용. 매월 1일 입출금내역 → PR / 다종 schema matrix / Slack 알림 / Artifact 보존 / Claude Code Action 으로 ledger 자동 작성 / 다중 기관 병렬 수집 6 시나리오.
---

# GitHub Actions × headless 수집 카탈로그

`bolta-io/h6s-action@v2` composite action 을 GitHub Actions cron 에 묶어 한국 금융 데이터(은행 입출금내역, 세금계산서, 현금영수증)를 정기 수집하는 패턴 묶음. CLI(`@h6s-ai/cli`) 가 진실 원천이고 액션은 한 step 짜리 얇은 래퍼라, 모든 시나리오는 `credentials 매칭 → data-job 폴링 → 결과 저장` 흐름이 같다. 분기되는 건 **언제 돌릴지 / 결과를 어디로 보낼지 / 어떤 후속 step 을 붙일지** 다.

데이터 수집 자체는 `h6s-data` skill 의 `h6s fetch` 와 동등하다 — 그쪽이 단발 호출, 이 skill 이 무인 cron 자동화. 팀 재무 후처리 시나리오(분개·대사·미수금 등)는 `internal-finance` skill 이 따로 다룬다.

## 0. 진입 체크

새 워크플로우를 만들기 전 한 번:

1. 콘솔(https://h6s.ai) → API Key 발급 → 대상 repo 의 secrets 에 `H6S_API_KEY` 등록
2. 사용할 provider 의 credential 이 워크스페이스에 있는지 확인 — 0건이면 운영자 단말에서 한 번 `h6s credentials create --interactive --cert` (공동인증서) 또는 `--interactive` (ID/PW) 로 등록. 액션은 provider 만 받고 credential 매칭을 백엔드가 자동 처리한다
3. 호출자 워크플로우의 `permissions:` 가 후속 step 에 맞게 열려 있는지 (PR 생성 → `contents: write` + `pull-requests: write`, Artifact 만 → 기본값 그대로)

## 1. 시나리오 분기

| 키워드 / 자연어 | 시나리오 | 출력 | 상세 |
|---|---|---|---|
| "매월 입출금내역", "전월 PR", "월간 수집" | **monthly-bank-pr** (P1) | PR | [references/scenario-monthly-bank-pr.md](references/scenario-monthly-bank-pr.md) |
| "주간 다종 수집", "은행+홈택스 한 번에", "matrix 수집" | **weekly-multi-schema** (P2) | PR (matrix 결과 합본) | [references/scenario-weekly-multi-schema.md](references/scenario-weekly-multi-schema.md) |
| "Slack 알림", "수집 완료 메시지" | **notify-on-fetch** (P3) | Slack | [references/scenario-notify-on-fetch.md](references/scenario-notify-on-fetch.md) |
| "artifact 보존", "감사용 백업", "PR 안 만들고 보관" | **upload-artifact** (P4) | GH Artifact (90일) | [references/scenario-upload-artifact.md](references/scenario-upload-artifact.md) |
| "AI 전표", "ledger 자동 작성", "beancount 자동" | **ai-ledger** (P5) | PR (전표 추가) | [references/scenario-ai-ledger.md](references/scenario-ai-ledger.md) |
| "여러 은행 병렬", "분리 계좌", "기관 matrix" | **multi-provider** (P6) | Artifact (provider 별) | [references/scenario-multi-provider.md](references/scenario-multi-provider.md) |
| "PG 정산 차이 PR", "이커머스 월말 마감", "스마트스토어 대사" | **ecommerce-settlement-pr** (P7) | PR (차이만) | [references/scenario-ecommerce-settlement-pr.md](references/scenario-ecommerce-settlement-pr.md) |
| "다중 클라이언트 matrix", "회계법인 월말 자료", "client matrix" | **accounting-firm-matrix-collect** (P8) | PR (클라이언트 디렉터리 합본) | [references/scenario-accounting-firm-matrix-collect.md](references/scenario-accounting-firm-matrix-collect.md) |
| "SaaS runway", "주간 캐시플로우 Slack", "주간 번 알림" | **saas-weekly-cashflow-burn** (P9) | Slack | [references/scenario-saas-weekly-cashflow-burn.md](references/scenario-saas-weekly-cashflow-burn.md) |

여러 시나리오가 동시에 필요하면 matrix 패턴(P2/P6) 을 먼저 검토. matrix 가 안 맞는 합성(예: P1 + P3)은 같은 job 에 step 만 추가하면 된다 — composite 액션 한 번 호출당 outputs(`path`/`count`/`job-id`/`summary`) 가 4개 다 나오니 후속 step 에서 그대로 끼운다.

## 2. 공통 룰북

- [references/conventions.md](references/conventions.md) — secrets·permissions·cron 시간대·output-path 명명·버전 핀 정책·진실 원천 약속
- [references/troubleshooting.md](references/troubleshooting.md) — credential 매칭 실패 / cron 미발동 / timeout / artifact 누락 / `@v2` 미해결

## 3. yml 본문 위치

각 시나리오의 워크플로우 yml 은 [`../../../h6s-action/examples/`](../../../h6s-action/examples/) 가 단일 진실 원천이다. 이 skill 의 `scenario-*.md` 는 시나리오 선택을 돕는 메타데이터 카탈로그(의도·키워드·입력/출력·핵심 step 발췌·응용 팁)만 두고 yml 본문을 중복 보관하지 않는다. 새 yml 을 추가/수정할 일이 생기면 `examples/` 를 먼저 손대고 같은 PR 에 `scenario-*.md` 의 요약을 따라가서 갱신한다.

## 4. 비대화형 호출

GitHub Actions 자체가 비대화형이라 별도 플래그가 필요 없다 — 액션이 내부적으로 CLI 를 `--quiet --no-color --output csv` 로 호출하고 결과를 디스크에 떨어뜨린다. 운영자 단말에서 미리 한 번 같은 명령을 돌려 결과 모양을 확인하고 yml 에 옮기는 흐름을 권장 ([references/conventions.md](references/conventions.md) § 단말 리허설).

## 자세한 정보

- [README.md](README.md) — 묶음 개요 + 진입 방법 + 시나리오 추가 절차
- [packages/h6s-action/README.md](../../h6s-action/README.md) — 액션 inputs/outputs 표
- [docs/github-action.md](../../../docs/github-action.md) — 내부 설계(CLI = 진실 원천, mirror flow)
- `h6s-data` skill — CLI 단발 호출 (이 skill 의 운영자 단말 리허설 단계와 동등)
- `internal-finance` skill — 팀 재무 후처리 카탈로그 (분개·대사·미수금)
