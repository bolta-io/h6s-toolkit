# A4 — reconcile-purchase (매입 대사)

월 매입 세금계산서와 같은 기간의 은행 출금을 자동 매칭. A2 와 대칭이되 미매칭의 의미가 다르다:

- **곧 송금**: 매입 세금계산서는 있는데 아직 송금 안 됨 → 송금 일정 확정 필요
- **무계산서 지출**: 출금은 있는데 매입 세금계산서가 없음 → 누락 의심, 적격증빙 점검

## 입력

- ContractRecord:
  - `hometax.tax-invoices.purchase.v1` (TaxInvoicePurchaseV1Record)
  - `bank.transactions.cb.v1` (BankTransactionV1Record) — 출금만 (`amount < 0`)
- 대상 기간: 지난달 (월초 결산 직후 실행 가정)
- 대상 자격증명: 홈택스 1장 + 등록된 모든 은행

## 절차

### 1. 데이터 수집

```bash
PERIOD="${PERIOD:-$(date -v-1m +%Y-%m)}"
PERIOD_START=$(date -v1d -j -f "%Y-%m" "$PERIOD" +%F)
PERIOD_END=$(date -v1d -v+1m -v-1d -j -f "%Y-%m" "$PERIOD" +%F)
OUT_DIR="${INTERNAL_FINANCE_OUTPUT_DIR:-./out}"
mkdir -p "$OUT_DIR"

# 매입 세금계산서
h6s fetch hometax.tax-invoices.purchase.v1 \
  --month "$PERIOD" \
  --output jsonl --save "$OUT_DIR/purchase-invoices-$PERIOD.jsonl" --quiet

# 은행 출금 — 지급기한 +30일 까지 확장 스캔
SCAN_END=$(date -v+30d -j -f "%F" "$PERIOD_END" +%F)
for PROVIDER in CB_KB CB_SHINHAN CB_WOORI ...; do
  h6s fetch bank.transactions.cb.v1 --provider "$PROVIDER" \
    --from "$PERIOD_START" --to "$SCAN_END" \
    --output jsonl --save "$OUT_DIR/outflow-$PERIOD-$PROVIDER.jsonl" --quiet &
done
wait

cat "$OUT_DIR"/outflow-$PERIOD-*.jsonl | jq -c 'select(.amount < 0)' > "$OUT_DIR/outflow-$PERIOD-all.jsonl"
```

### 2. 매칭 알고리즘 (양방향)

A2 와 같은 매칭 규칙([conventions.md § 금액·날짜 허용오차](conventions.md#금액·날짜-허용오차))을 양방향으로 적용:

- **매입 → 출금**: 매입 세금계산서 1건당 출금 후보 검색 → 매칭 / 후보 / `곧 송금` (아직 출금 없음)
- **출금 → 매입**: 출금 1건당 매입 세금계산서 후보 검색 → 매칭 / 후보 / `무계산서 지출` (매입 세금계산서 없음)

`매칭` 이 양쪽에서 동시에 성립하면 양쪽 결과에서 매칭으로 표시. 한쪽만 매칭이면 사람 검토 필요한 후보.

### 3. 카테고리 결정

| 결과 | 의미 | 후속 |
|---|---|---|
| `매칭` | 매입 세금계산서 ↔ 출금 일치 | 정상, CSV 만 남김 |
| `후보` | 부분 일치 (거래처명 또는 금액 ±오차) | 사람 검토 |
| `곧 송금` | 매입 세금계산서 있음 + 출금 없음 | 송금 일정 확정 |
| `무계산서 지출` | 출금 있음 + 매입 세금계산서 없음 | 적격증빙 점검 |

`무계산서 지출` 안에서도 다음은 정상으로 분류:
- 급여·4대보험 출금 (계산서 대상 아님)
- 법인세·부가세 납부
- 카드결제 (이미 카드매입금 처리)
- 내부 송금·가지급금

→ `conventions.md § 계정과목 분류 룰북 — 출금` 으로 1차 필터링 후 남는 `무계산서 지출` 만 후속 검토 대상.

### 4. CSV 저장

[output-templates.md § A2 / A4 매칭 결과 CSV](output-templates.md#a2--a4-매칭-결과-csv-컬럼) 와 동일 컬럼:

```
세금계산서일,공급자,공급받는자,금액,승인번호,매칭상태,매칭거래일,매칭금액,비고
```

매칭상태에 `매칭` / `후보` / `곧 송금` / `무계산서 지출` 4개 값.

경로: `$OUT_DIR/reconcile-purchase-$PERIOD.csv`.

### 5. Notion 누적

`곧 송금` + `무계산서 지출` + `후보` 를 Notion DB(`NOTION_DB_RECONCILE_PURCHASE`) 로 송신. `매칭` 은 CSV 에만.

[output-templates.md § A4 미매칭 매입 DB](output-templates.md#a4-미매칭-매입-db-컬럼) 컬럼.

`곧 송금` 카테고리의 페이지에는 `Expected Outflow Date` 를 매입 세금계산서 작성일 + 결제기한으로 자동 채움.

### 6. Slack 결과 보고

```
✅ ${PERIOD} 매입 대사 완료
매칭 ${MATCH} 건 / 후보 ${CANDIDATE} 건 / 곧 송금 ${PENDING} 건 / 무계산서 지출 ${MISSING_INVOICE} 건
미매칭/후보: ${NOTION_URL}
전체 CSV: ${CSV_PATH}
```

### 7. 사용자에게 한 줄 보고

```
A4 reconcile-purchase (${PERIOD}): 매입 ${TOTAL} 건 / 출금 ${OUTFLOW_TOTAL} 건
→ 매칭 ${MATCH} / 후보 ${CANDIDATE} / 곧 송금 ${PENDING} / 무계산서 지출 ${MISSING_INVOICE}
"무계산서 지출" 중 정상 분류 제외하면 ${REAL_MISSING} 건이 적격증빙 점검 대상
```

## 운영 주기

월 1회 (월초). 분기말은 B1 vat-precheck 직전에 한 번 더.

## 검증 (Stage 1)

1. 첫 1개월: `무계산서 지출` 의 사람 검토에서 드러나는 패턴(정상 송금 분류, 카드결제 매핑, 거래처 변형) → conventions.md 룰북 보강
2. `곧 송금` 의 정확도 ≥ 90% → 송금 일정 시스템화 연계

## 에러 처리

| 상황 | 대응 |
|---|---|
| 홈택스 응답 0건 | 매입이 정말 없는 달일 수도 — `무계산서 지출` 전체가 검토 대상 |
| 출금 분류 룰북이 빈약 | 정상/비정상 분류 정확도 떨어짐 → conventions.md 보강 |
| 같은 출금이 여러 매입에 분할 매칭 후보 | "분할 매칭 후보" 로 표시하고 사람 검토 |
