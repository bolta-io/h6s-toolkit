# M1 — solopreneur-vat-quarterly (1인 사장님 분기 부가세 자료)

부가세를 직접 신고하는 1인 사업자·소상공인이 분기마다 반복하는 자료 모으기를 Claude Desktop 한 줄로 끝낸다. 신고서 항목별 합계까지 채팅창에 도착.

## 입력

- ContractRecord 4종:
  - `hometax.tax-invoices.sales.v1`, `hometax.tax-invoices.purchase.v1`
  - `hometax.cash-receipts.sales.v1`, `hometax.cash-receipts.purchase.v1`
- 대상 기간: 직전 분기 (`2026-Q1` 등). 미명시면 [conventions.md § 기간 해석](conventions.md#기간-해석) 의 "지난 분기" 적용
- 자격증명: 홈택스 1장 (콘솔에서 사전 등록)

## 자연어 트리거 예시

- `2026-Q1 부가세 신고용 자료 모아줘`
- `지난 분기 매출/매입 세금계산서랑 현금영수증 합계 알려줘`
- `이번 분기 신고 예정 납부세액 얼마야`

## tool 호출 순서

```text
1. (선택) h6s_catalog          — 첫 호출이면 capability 확인
2. h6s_fetch_data × 4 (병렬)   — 4종 schema, 분기 기간
```

병렬 호출 인자 (분기 = 2026-Q1 예시):

```json
{
  "schema": "hometax.tax-invoices.sales.v1",
  "provider": "HOMETAX",
  "dateRangeStart": "2026-01-01",
  "dateRangeEnd": "2026-03-31"
}
```

`hometax.tax-invoices.purchase.v1`, `hometax.cash-receipts.sales.v1`, `hometax.cash-receipts.purchase.v1` 도 같은 기간으로.

## 합계 산출

| 항목 | 계산 |
|---|---|
| 매출 과세표준 | sales.supplyAmount 합 + cash-sales.supplyAmount 합 |
| 매출세액 | sales.taxAmount 합 + cash-sales.taxAmount 합 |
| 매입 과세표준 | purchase.supplyAmount 합 + cash-purchase.supplyAmount 합 |
| 매입세액 | purchase.taxAmount 합 + cash-purchase.taxAmount 합 |
| 납부할 세액 | 매출세액 - 매입세액 |

음수면 환급 — 응답에 `환급 예상 ${REFUND}` 라고 한 줄 강조.

## 응답 포맷

```text
✓ 2026-Q1 부가세 신고 자료 — 납부 예상 1,448,000원
매출 세금계산서 18건 24,300,000 / 매입 12건 9,820,000 (현금영수증 포함)
신고 항목별 표가 필요하면 "표로 보여줘" 한 줄, 검증 체크리스트는 "사전 점검 해줘".
```

표 요청 시 풀어서 응답:

```text
구분         건수   과세표준      세액
매출 세계산   18    24,300,000   2,430,000
매출 현금     3      870,000      87,000
매출 합계    21    25,170,000   2,517,000
매입 세계산   12     9,820,000     982,000
매입 현금     2       870,000      87,000
매입 합계    14    10,690,000   1,069,000
납부 예상                          1,448,000
```

## 다음 자연어 권유

- 사전 점검 (자가 검증 체크리스트) — `internal-finance` 의 B1 vat-precheck 연계: "사전 점검 체크리스트도 돌려줘"
- CSV 저장: "CSV 로 내려줘" → `h6s fetch ... --output csv --save vat-2026-Q1.csv` 안내

## 운영 주기

분기 1회 (신고 직전 ~1주).

## 에러 처리

[SKILL.md § 5 에러 처리](../SKILL.md#5-에러-처리) 의 표준 매핑 + 다음 추가:

| 상황 | 대응 |
|---|---|
| 4종 중 일부만 0건 | 면세 사업자 등 정상일 수 있음 — "매출 0건이 맞나요?" 한 줄 확인 |
| 사업자번호 자기 사업자번호와 불일치 건 발견 | "○건 발견 — 별도 표시할까요?" |
| 분기 기간이 schema `maxRangeDays` 초과 | 월 단위 3회로 자동 분할 (사용자에게 알릴 필요 없음) |
