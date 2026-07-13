# A2 — reconcile-sales (매출 대사)

월 매출 세금계산서와 같은 기간의 은행 입금을 자동 매칭. 미매칭 건은 Notion DB 로 누적해 담당자가 후속 처리.

## 입력

- ContractRecord:
  - `hometax.tax-invoices.sales.v1` (TaxInvoiceSalesV1Record)
  - `bank.transactions.cb.v1` (BankTransactionV1Record) — 입금만 (`amount > 0`)
- 대상 기간: 지난달 1일 ~ 말일 (월말 결산 직후 실행 가정). 사용자 지정 시 그 값.
- 대상 자격증명: 홈택스 1장 + 등록된 모든 은행

## 절차

### 1. 기간 결정 + 입출 데이터 수집

```bash
# GNU date 기준 (GitHub Actions / Linux). macOS 단발 리허설은 brew install coreutils 후 gdate 로 치환.
PERIOD="${PERIOD:-$(date -u -d '1 month ago' +%Y-%m)}"   # 기본 지난달
PERIOD_START="${PERIOD}-01"
PERIOD_END=$(date -u -d "${PERIOD_START} +1 month -1 day" +%F)
OUT_DIR="${INTERNAL_FINANCE_OUTPUT_DIR:-./out}"
mkdir -p "$OUT_DIR"

# 매출 세금계산서 — 홈택스 1장으로 사업자번호 GLOBAL
h6s fetch hometax.tax-invoices.sales.v1 \
  --month "$PERIOD" \
  --output jsonl --save "$OUT_DIR/sales-invoices-$PERIOD.jsonl" \
  --quiet

# 은행 입금 — 매칭 후보를 넓히기 위해 결제기한을 고려해 +30일 까지 포함
SCAN_END=$(date -u -d "${PERIOD_END} +30 days" +%F)
for PROVIDER in CB_KB CB_SHINHAN CB_WOORI ...; do
  h6s fetch bank.transactions.cb.v1 \
    --provider "$PROVIDER" \
    --from "$PERIOD_START" --to "$SCAN_END" \
    --output jsonl --save "$OUT_DIR/inflow-$PERIOD-$PROVIDER.jsonl" --quiet &
done
wait

# 입금만 필터링 (amount > 0)
cat "$OUT_DIR"/inflow-$PERIOD-*.jsonl | jq -c 'select(.amount > 0)' > "$OUT_DIR/inflow-$PERIOD-all.jsonl"
```

### 2. 매칭 알고리즘

각 세금계산서에 대해 입금 후보를 찾는다. 매칭 기준은 [conventions.md § 금액·날짜 허용오차](conventions.md#금액·날짜-허용오차):

1. **금액 정확 일치** + **거래처명 정규화 매칭** + **세금계산서 작성일 ±3 영업일 안에 입금**
   → `매칭` (높은 신뢰도)
2. 금액 정확 일치 + 거래처명 부분 일치 + ±7일
   → `후보` (사람 검토)
3. 금액 정확 일치 + 거래처명 미매칭 + 같은 달
   → `후보` (낮은 신뢰도, AI 가 한 번 더 판정)
4. 위에 해당 없음
   → `미매칭`

거래처명 변형은 [conventions.md § 거래처명 변형 매칭](conventions.md#거래처명-변형-매칭) 5단계 모두 시도.

매칭 1건이 여러 입금에 split 된 경우: 같은 거래처에서 같은 달에 부분 금액들이 합이 일치하면 `매칭 (분할)` 으로 표시.

### 3. 결과 셰이프

```json
{
  "invoiceId": "20260415-...",  // ntsTransactionId
  "writeDate": "2026-04-15",
  "vendor": "(주)예시거래처",
  "vendorBizNum": "123-45-67890",
  "amount": 11000000,
  "status": "매칭" | "후보" | "미매칭" | "매칭 (분할)",
  "matchedTransactions": [
    { "transactionAt": "...", "providerCode": "CB_KB", "amount": 11000000, "description": "..." }
  ],
  "confidence": "high" | "medium" | "low",
  "notes": "거래처명 정규화 매칭 — '에이비씨주식회사' ↔ '에이비씨'"
}
```

### 4. CSV 저장

[output-templates.md § A2 / A4 매칭 결과 CSV](output-templates.md#a2--a4-매칭-결과-csv-컬럼) 컬럼 따라:

```
세금계산서일,공급자,공급받는자,금액,승인번호,매칭상태,매칭거래일,매칭금액,비고
```

저장 경로: `$OUT_DIR/reconcile-sales-$PERIOD.csv`. UTF-8 BOM 부착.

### 5. Notion 누적

`미매칭` + `후보` 만 Notion DB(`NOTION_DB_RECONCILE_SALES`) 로 송신. `매칭` 은 CSV 에만 남기고 Notion 까지 보내지 않는다 (시그널 노이즈 감소).

이미 DB 에 같은 `invoiceId` 페이지가 있으면 update, 없으면 create. (Notion API 의 query → patch / create 패턴)

`매칭` 상태로 후속 update 가 발생하면 DB 페이지의 Status 필드를 `매칭완료` 로 바꾸고 매칭 거래 메타를 Notes 에 추가.

### 6. Slack 결과 보고

[output-templates.md § Slack 결과 보고](output-templates.md#결과-보고-b1-b2-b3) 포맷.

```
✅ ${PERIOD} 매출 대사 완료
매칭 ${MATCH_COUNT} 건 / 후보 ${CANDIDATE_COUNT} 건 / 미매칭 ${UNMATCHED_COUNT} 건
미매칭/후보: ${NOTION_URL}
전체 CSV: ${CSV_PATH}
```

### 7. 사용자에게 한 줄 보고

```
A2 reconcile-sales (${PERIOD}): 매출 ${TOTAL_INVOICES} 건 → 매칭 ${MATCH_COUNT} / 후보 ${CANDIDATE_COUNT} / 미매칭 ${UNMATCHED_COUNT}
미매칭은 Notion 에 누적 — 담당자 후속 처리 필요
```

## 운영 주기

매월 1회 (월말 영업 종료 후 ~ 다음달 5일 안). 분기말은 부가세 사전 점검(B1) 직전에 한 번 더 돌려 정합성 확보.

## 검증 (Stage 1)

1. 첫 1개월: 매칭률 ≥ 80% (`매칭` / 전체 세금계산서) 목표
2. 미매칭 건의 사람 검토에서 드러나는 패턴(거래처명 변형, 결제기한, 분할 입금) 을 [conventions.md § 거래처명 변형 매칭](conventions.md#거래처명-변형-매칭) 으로 환원
3. 3개월 누적 후 매칭률 ≥ 90% 면 자동화 신뢰도 충족

## 에러 처리

| 상황 | 대응 |
|---|---|
| 홈택스 응답 0건 | 영업외 일 가능성 — 사용자에게 보고 후 종료 |
| 매칭률 < 70% | conventions.md 룰북 보완 필요 신호. 사용자에게 보고 |
| `DATE_RANGE_EXCEEDED` | 월 단위는 안전 범위 안. 사용자 지정 기간이 너무 크면 분할 |
| Notion 4xx | 토큰·DB ID 확인 후 stdout fallback |
