# B1 — vat-precheck (부가세 사전 점검)

분기 부가세 신고 전에 매출/매입 세금계산서와 현금영수증 합계를 합산해 홈택스 신고 예정 금액과 비교. 누락·중복·금액 차이를 신고 전에 발견해 수정 신고 비용을 줄인다.

## 입력

- ContractRecord:
  - `hometax.tax-invoices.sales.v1`, `hometax.tax-invoices.purchase.v1`
  - `hometax.cash-receipts.sales.v1`, `hometax.cash-receipts.purchase.v1`
- 대상 기간: 직전 분기 (`PERIOD=2026-Q1` 등)
- 대상 자격증명: 홈택스 1장

## 절차

### 1. 분기 기간 결정

```bash
# 사용자 지정 권장. 기본: 직전 분기 — 셸 산술로 계산
if [ -z "${PERIOD:-}" ]; then
  PREV_YM=$(date -u -d '1 month ago' +%Y-%m)
  YEAR=${PREV_YM%-*}
  MONTH=${PREV_YM#*-}
  QUARTER=$(( (10#$MONTH - 1) / 3 + 1 ))
  PERIOD="${YEAR}-Q${QUARTER}"
fi
case "$PERIOD" in
  *-Q1) PERIOD_START="${PERIOD%-*}-01-01"; PERIOD_END="${PERIOD%-*}-03-31" ;;
  *-Q2) PERIOD_START="${PERIOD%-*}-04-01"; PERIOD_END="${PERIOD%-*}-06-30" ;;
  *-Q3) PERIOD_START="${PERIOD%-*}-07-01"; PERIOD_END="${PERIOD%-*}-09-30" ;;
  *-Q4) PERIOD_START="${PERIOD%-*}-10-01"; PERIOD_END="${PERIOD%-*}-12-31" ;;
esac
OUT_DIR="${INTERNAL_FINANCE_OUTPUT_DIR:-./out}"
mkdir -p "$OUT_DIR"
```

### 2. 4종 데이터 수집

```bash
for SCHEMA in \
  hometax.tax-invoices.sales.v1 \
  hometax.tax-invoices.purchase.v1 \
  hometax.cash-receipts.sales.v1 \
  hometax.cash-receipts.purchase.v1; do
  h6s fetch "$SCHEMA" \
    --from "$PERIOD_START" --to "$PERIOD_END" \
    --output jsonl --save "$OUT_DIR/vat-$PERIOD-$(echo $SCHEMA | tr . -).jsonl" \
    --quiet &
done
wait
```

각 schema 의 `maxRangeDays` 가 분기보다 짧으면 CLI 가 자동 분할하거나 `DATE_RANGE_EXCEEDED` — 후자면 월 단위로 쪼개서 다시.

### 3. 합계 산출

| 항목 | 계산 |
|---|---|
| 매출 과세표준 | tax-invoices.sales.supplyAmount 합 + cash-receipts.sales.supplyAmount 합 |
| 매출세액 | tax-invoices.sales.taxAmount 합 + cash-receipts.sales.taxAmount 합 |
| 매입 과세표준 | tax-invoices.purchase.supplyAmount 합 + cash-receipts.purchase.supplyAmount 합 |
| 매입세액 | tax-invoices.purchase.taxAmount 합 + cash-receipts.purchase.taxAmount 합 |
| 납부할 세액 | 매출세액 - 매입세액 |

### 4. 자가 검증 체크리스트

각 항목에 통과/실패 표시:

1. **합계 0 의심**: 매출 또는 매입 0원 → 데이터 누락 가능, 사용자 보고
2. **음수 세액**: 매출세액 < 매입세액 → 환급 대상 (정상이면 OK, 의심이면 검토)
3. **현금영수증 매출 ↔ 현금 거래 정합성**: 은행 거래의 현금 입금 합 vs cash-receipts.sales 합 (`B3 cash-receipt-gap-detector` 참고)
4. **이전 분기 대비 ±50% 이상 차이**: 사람 검토 필요 신호
5. **사업자번호 일관성**: 모든 레코드의 `supplierBusinessIdentifier` (매출) / `buyerBusinessIdentifier` (매입) 가 워크스페이스 BIZNO 와 일치 — 불일치 건 별도 보고

### 5. 결과 보고

CSV (`vat-precheck-$PERIOD.csv`):

```
구분,건수,과세표준,세액
매출 세금계산서,...
매출 현금영수증,...
매출 합계,...
매입 세금계산서,...
매입 현금영수증,...
매입 합계,...
납부할 세액,...
```

추가 시트(또는 별도 CSV) — 자가 검증 체크리스트 결과:

```
체크항목,결과,비고
합계 0 의심,통과,...
음수 세액,통과,...
...
```

Slack 보고:

```
✅ ${PERIOD} 부가세 사전 점검
매출 ${SALES_TOTAL} 원 (세액 ${SALES_TAX} 원)
매입 ${PURCHASE_TOTAL} 원 (세액 ${PURCHASE_TAX} 원)
납부 예상 ${PAYABLE} 원
체크리스트 ${PASSED}/${TOTAL} 통과
상세: ${CSV_PATH}
```

### 6. 사용자에게 한 줄 보고

```
B1 vat-precheck (${PERIOD}): 납부 ${PAYABLE} 원 예상 / 체크리스트 ${PASSED}/${TOTAL} 통과
${FAILED_CHECKS} 미해결 — 신고 전 점검 필요
```

## 운영 주기

분기 1회 (분기 종료 후 ~ 신고일 -1주). 신고 직전 한 번 더 (변동 확인).

## 검증 (Stage 1)

1. 첫 분기: 점검 결과 vs 실제 세무사 검토 결과 비교 → 차이 패턴 분석
2. 체크리스트가 0/N 통과면 사람 검토 우선순위 알람
3. 분기별 추세 그래프(매출·매입·납부세액) 를 Notion 또는 별도 대시보드에 누적

## 에러 처리

| 상황 | 대응 |
|---|---|
| 4종 중 일부만 0건 | 정상일 수도 (예: 면세 사업자 매출세액 0) — 사용자 확인 후 진행 |
| 매출 - 매입 = 환급 대상 | 별도 강조 표시 (Slack `🔵 환급 ${REFUND} 원 예상`) |
| 사업자번호 불일치 건 발견 | 별도 CSV(`vat-precheck-$PERIOD-bizmismatch.csv`) + 사용자 강조 보고 |
