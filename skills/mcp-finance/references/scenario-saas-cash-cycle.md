# M3 — saas-cash-cycle (SaaS 캐시 사이클 자연어 요약)

런웨이를 매주 체크하는 초기 SaaS 창업자·CFO 가 Claude Desktop 에 한 줄 — 이번달 매출 입금, 카드 출금, 운영 잔액, 추정 runway 까지.

## 입력

- ContractRecord:
  - `bank.transactions.cb.v1` (전 은행 입출금)
  - (선택) `bank.accounts.cb.v1` (현재 잔액 — 거래 합산 대신 직접 받기)
- 대상 기간: 이번달 또는 최근 4주
- 자격증명: 운영 은행 1~N개

## 자연어 트리거 예시

- `이번달 캐시 사이클 요약해줘`
- `runway 며칠 남았어`
- `이번주 net 캐시 변화 알려줘`

## tool 호출 순서

```text
1. h6s_fetch_data            — bank.transactions.cb.v1, provider 자동 선택
2. (선택) h6s_fetch_data     — bank.accounts.cb.v1, 잔액 직접
```

복수 은행 자격증명이면 `h6s_list_credentials` 1회 호출 후 모든 provider 에 병렬 fetch.

## 계산 항목

| 항목 | 계산 |
|---|---|
| 매출 입금 합 | 입금 거래 중 `매출`, `정산`, `결제`, 카드사·PG 적요 매칭 |
| 카드 출금 합 | 카드사 적요 출금 (`* 카드결제 *` 등) |
| 인건비 출금 | 급여 적요 (`*급여*`, `*월급*`, `*4대보험*`) |
| Net 변화 | 입금 합 - 출금 합 |
| 운영 잔액 | (잔액 조회) 또는 (기간 시작 잔액 + Net 변화) |
| 추정 runway | 운영 잔액 ÷ 최근 4주 평균 번 / 4 (개월) |

분류 매칭 규약은 [internal-finance § 계정과목 룰북](../../internal-finance/references/conventions.md#계정과목-분류-룰북-분개-제안용) 의 sub-set 사용 — 동일 mapping 을 재사용해 일관성 유지.

## 응답 포맷

```text
✓ 2026-04 캐시 사이클 — runway 약 7.8개월
매출 입금 +38,400,000 / 카드 출금 -18,210,000 / 운영 잔액 142,800,000
"주간 추이" 또는 "Slack 알림 설정" 으로 다음.
```

`runway` 추정이 어려운 경우(번이 0 이하 또는 잔액 미상):

```text
runway 추정 불가 — Net 변화가 양수(흑자)이거나 잔액 데이터 없음. 자세히 보려면 "주간 추이".
```

## 다음 자연어 권유

- 주간 Slack 알림 — `saas-weekly-cashflow-burn` (github-action) 시나리오로 정기화
- 4주 추이 — 같은 시나리오 반복 4번 → 추이 표 생성
- 부서별 분류 — `internal-finance` 의 B2 dept-expense-classifier 연계

## 운영 주기

주 1회 (월요일 아침) 또는 월말.

## 에러 처리

| 상황 | 대응 |
|---|---|
| 다중 은행 + 자격증명 일부 만료 | 유효 자격증명만 합산, 만료된 은행은 응답에 "(○○은행 자격증명 갱신 필요)" 한 줄 |
| 잔액 조회 권한 없음 | runway 계산 skip, 응답에 "잔액 조회 권한 없음 — Net 변화만 표시" |
| 4주 데이터 부재 (신규 워크스페이스) | runway 대신 "데이터 누적 ${WEEKS}주 — 4주 이상이면 runway 추정 가능" |
