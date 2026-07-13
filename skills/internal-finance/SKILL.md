---
name: internal-finance
description: 팀 재무 업무 자동화 카탈로그. 사용자가 "입출금내역 요약", "세금계산서 대사", "미수금 정리", "매입 대사", "부가세 사전 점검", "부서별 지출", "현금영수증 누락", "주간 입출금내역 백업", "팀 재무 자동화", "재무팀 자동화" 같은 키워드로 재무 처리를 요청할 때 자동 적용. headless 워크스페이스 자격증명으로 은행/홈택스 데이터를 받아 분개·대사·미수금 추적·시즌형 검증까지 한 묶음으로 처리.
---

# 팀 재무 자동화 카탈로그

`@h6s-ai/cli`와 `h6s-data` skill을 한 단계 더 묶어, **재무팀의 매월 반복 업무**(분개 제안, 세금계산서 대사, 미수금 추적, 부가세 사전 점검 등)를 빠르게 처리하는 시나리오 모음입니다.

전 시나리오는 `h6s-data` skill의 `h6s fetch ...` 결과를 입력으로 받습니다. 데이터 수집 자체는 `h6s-data` skill에 위임하고, 이 skill은 받은 결과를 **가공·매칭·분류·알림** 하는 워크플로우를 담당합니다.

## 0. 진입 확인 — 워크스페이스가 준비됐는가

```bash
h6s --version || npm i -g @h6s-ai/cli
h6s me                          # 현재 로그인 프로필 확인
h6s credentials list            # 자격증명이 등록되어 있는지
```

`h6s me` 가 재무팀 워크스페이스가 아니면 멈추고 사용자에게 보고. 자격증명이 0개면 `references/stage-0-bootstrap.md` 를 따른다.

## 1. 시나리오 분기 — 사용자가 뭘 원하는가

| 키워드 / 자연어 | 시나리오 | 상세 절차 |
|---|---|---|
| "오늘 입출금내역", "일일 입출금 요약", "분개 제안" | **daily-bank-summary** (A1) | [references/scenario-daily-bank-summary.md](references/scenario-daily-bank-summary.md) |
| "매출 대사", "입금 대사", "세금계산서 입금 매칭" | **reconcile-sales** (A2) | [references/scenario-reconcile-sales.md](references/scenario-reconcile-sales.md) |
| "미수금", "연체", "독촉" | **dunning-tracker** (A3) | [references/scenario-dunning-tracker.md](references/scenario-dunning-tracker.md) |
| "매입 대사", "지출 매칭", "무계산서 지출" | **reconcile-purchase** (A4) | [references/scenario-reconcile-purchase.md](references/scenario-reconcile-purchase.md) |
| "부가세 사전 점검", "VAT 점검", "신고 전 대조" | **vat-precheck** (B1) | [references/scenario-vat-precheck.md](references/scenario-vat-precheck.md) |
| "부서별 지출", "프로젝트별 비용 분류" | **dept-expense-classifier** (B2) | [references/scenario-dept-expense.md](references/scenario-dept-expense.md) |
| "현금영수증 누락", "현금 매출 발행 점검" | **cash-receipt-gap-detector** (B3) | [references/scenario-cash-receipt-gap.md](references/scenario-cash-receipt-gap.md) |
| "주간 입출금내역 백업", "입출금내역 CSV 저장" | **weekly-backup-action** (C2) | [references/scenario-weekly-backup.md](references/scenario-weekly-backup.md) |
| "1인 사장님 종소세", "월별 종소세 누적", "종합소득세 자료" | **solopreneur-income-tax** (V1) | [references/scenario-solopreneur-income-tax.md](references/scenario-solopreneur-income-tax.md) |
| "PG 정산 대사", "네이버페이/카카오페이 매칭", "이커머스 PG-은행" | **ecommerce-pg-reconciliation** (V2) | [references/scenario-ecommerce-pg-reconciliation.md](references/scenario-ecommerce-pg-reconciliation.md) |

여러 시나리오가 한 번에 요청되면 시간 순서대로 차례로 실행. 시나리오 간 데이터 의존이 있으면(A2 → A3) 앞 시나리오 결과를 다음 입력으로 넘긴다.

## 2. 공통 룰북

모든 시나리오가 공유하는 환경변수·계정과목 룰북·매칭 알고리즘·출력 템플릿은 다음 두 문서에 있다. 시나리오 진입 전 한 번 읽어둔다.

- [references/conventions.md](references/conventions.md) — 환경변수 규약, 계정과목 분류 룰북, 거래처명 변형 매칭, 금액·날짜 허용오차
- [references/output-templates.md](references/output-templates.md) — Slack 메시지·Notion DB 페이지·CSV 컬럼 표준 포맷

## 3. 출력 라우팅

각 시나리오는 다음 3개 출력처 중 하나 이상으로 결과를 보냅니다. 사용자가 지정하지 않으면 시나리오 기본값을 사용합니다.

| 출력처 | 용도 | 진입 명령 |
|---|---|---|
| Slack | 즉시 가시화 — 일일 요약, 미수금 DM | `curl -X POST $SLACK_WEBHOOK_URL ...` (`references/output-templates.md` § Slack) |
| Notion | 리스트·DB 형태 누적 — 미매칭 거래, 미수금 트래커 | `curl https://api.notion.com/v1/pages ...` (`references/output-templates.md` § Notion) |
| CSV 파일 | 회계 시스템 인계, 엑셀 작업 | `--save ./out/<scenario>-YYYY-MM.csv` |

`SLACK_WEBHOOK_URL`, `NOTION_TOKEN`, `NOTION_DB_*` 환경변수가 없으면 stdout 으로 fallback 하고 사용자에게 보고.

## 4. 에러 처리

데이터 수집 단계의 에러(`CREDENTIAL_INSUFFICIENT_FOR_PROVIDER`, `DATE_RANGE_EXCEEDED`, `MONTHLY_QUOTA_EXCEEDED` 등)는 `h6s-data` skill 의 § 6 에러 처리 가이드를 그대로 따른다.

이 skill 의 처리 단계에서 발생하는 추가 에러는:

| 상황 | 대응 |
|---|---|
| 매칭률 < 70% (대사 시나리오) | 사용자에게 "매칭 알고리즘 정확도가 낮다, conventions.md § 거래처명 변형 룰 보완 필요" 보고 |
| 분개 룰북에 없는 계정과목 의심 | "AI 추론 결과를 conventions.md § 계정과목 룰북 에 추가 검토 필요" 로 표시하고 진행 |
| 환경변수 누락 | Slack/Notion 대신 stdout fallback. 사용자에게 누락 변수명 보고 |
| 자격증명 만료(`CERT_EXPIRED`) | `h6s credentials create --interactive --cert` 안내 |

## 5. 비대화형 호출

GitHub Actions 등 무인 환경에서는 사용자 확인 단계를 모두 skip 하고 시나리오를 끝까지 실행한다. 자세한 설정은 [references/scenario-weekly-backup.md](references/scenario-weekly-backup.md) 와 `github-actions/weekly-backup.yml` 참고.

## 자세한 정보

- [README.md](README.md) — 묶음 전체 개요 + Stage 0 부트스트랩 가이드
- [references/](references/) — 시나리오별 상세 절차 + 공통 룰북
- `h6s-data` skill — 데이터 수집 단계 (이 skill 의 입력 단계)
