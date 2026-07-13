# B3 — cash-receipt-gap-detector (현금영수증 발행 누락 탐지)

같은 기간의 은행 현금 입금 합 vs 홈택스 현금영수증 매출 합 비교. 발행 누락 의심 건을 탐지.

## 입력

- ContractRecord:
  - `hometax.cash-receipts.sales.v1`
  - `bank.transactions.cb.v1` (현금 입금만 — 적요·상대계좌로 식별)
- 대상 기간: 지난달 (월 1회 실행)
- 대상 자격증명: 홈택스 + 등록된 모든 은행

## 절차

### 1. 데이터 수집

```bash
PERIOD="${PERIOD:-$(date -v-1m +%Y-%m)}"
PERIOD_START=$(date -v1d -j -f "%Y-%m" "$PERIOD" +%F)
PERIOD_END=$(date -v1d -v+1m -v-1d -j -f "%Y-%m" "$PERIOD" +%F)
OUT_DIR="${INTERNAL_FINANCE_OUTPUT_DIR:-./out}"

# 현금영수증 매출
h6s fetch hometax.cash-receipts.sales.v1 \
  --from "$PERIOD_START" --to "$PERIOD_END" \
  --output jsonl --save "$OUT_DIR/cash-receipts-$PERIOD.jsonl" --quiet

# 은행 입금
for PROVIDER in CB_KB CB_SHINHAN ...; do
  h6s fetch bank.transactions.cb.v1 --provider "$PROVIDER" \
    --from "$PERIOD_START" --to "$PERIOD_END" \
    --output jsonl --save "$OUT_DIR/cash-inflow-$PERIOD-$PROVIDER.jsonl" --quiet &
done
wait
```

### 2. 현금 입금 식별

은행 거래 중 현금 입금으로 분류할 패턴:

- 적요 패턴: `*현금입금*`, `ATM`, `무통장`, `타행무통장` 등
- 상대계좌 정보 없음 (개인 무통장 입금)
- (선택) 팀 룰북 `INTERNAL_CASH_PATTERN_PATH` CSV 로 확장

카드 입금·계좌이체 (거래처에서 받은 정상 매출 채권 회수) 는 제외 — A2 가 처리.

### 3. 매칭

각 현금영수증 매출 1건당 기간 ±3일 안의 현금 입금 후보를 찾는다:

- 금액 정확 일치 + 같은 날 또는 ±1일
- 금액 정확 일치 + ±3일 (후보)

매칭되지 않는 현금영수증은 `현금영수증만 있음` — 발행은 했는데 실제 입금은 안 됨 (또는 별 채널). 사람 검토.

매칭되지 않는 현금 입금은 `현금영수증 미발행 의심` — 핵심 탐지 대상.

### 4. 분류

| 결과 | 의미 | 우선순위 |
|---|---|---|
| `매칭` | 현금영수증 ↔ 입금 매칭 | 정상 |
| `현금영수증 미발행 의심` | 입금 있음 + 현금영수증 없음 | ⚠️ 발행 누락 가능 |
| `현금영수증만 있음` | 발행 있음 + 입금 없음 | 후속 확인 |

`현금영수증 미발행 의심` 중에서 다음은 제외:
- 적요에 `이자`, `급여 반환`, `환급` 등 매출 아닌 거래
- 거래처가 직원/관계사 (가지급금 회수)
- 임대료·예금 만기·외환 환전

→ [conventions.md § 계정과목 분류 룰북 — 입금](conventions.md#계정과목-분류-룰북-분개-제안용) 으로 1차 필터.

### 5. 결과 보고

CSV (`cash-receipt-gap-$PERIOD.csv`):

```
구분,금액,거래일,적요/공급자,비고
```

Slack:

```
✅ ${PERIOD} 현금영수증 발행 점검
매칭 ${MATCH} 건 / ⚠️ 발행 누락 의심 ${MISSING} 건 (${MISSING_TOTAL} 원) / 입금 미확인 ${NO_INFLOW} 건
상세: ${CSV_PATH}
```

`MISSING > 0` 이면 강조 색.

### 6. 사용자에게 한 줄 보고

```
B3 cash-receipt-gap-detector (${PERIOD}): 매칭 ${MATCH} / 발행 누락 의심 ${MISSING}
발행 의무 점검 후 누락분 즉시 발행 (`홈택스 → 현금영수증 → 자진발행`)
```

## 운영 주기

월 1회 (월초). 부가세 신고 시즌 직전에 한 번 더.

## 검증 (Stage 1)

1. 첫 1개월: `발행 누락 의심` 의 사람 검토 → 정상/실제 누락 비율 확인
2. 정상 케이스 패턴(이자·환급 등) 을 conventions.md 룰북에 환원해 false positive 감소
3. 실제 누락 0건 유지 — 누락 발견 시 즉시 자진 발행 + 팀 절차 보완

## 에러 처리

| 상황 | 대응 |
|---|---|
| 현금 입금 식별 어려움 (적요 일관성 없음) | 사용자에게 "은행별 현금 입금 패턴이 다양 — INTERNAL_CASH_PATTERN_PATH CSV 보강 필요" |
| `발행 누락 의심` 비율 > 30% | 식별 룰이 너무 넓음 — 룰북 좁히기 |
| 현금영수증 0건 | 정말 0건이면 정상. 아니면 자격증명·기간 점검 |
