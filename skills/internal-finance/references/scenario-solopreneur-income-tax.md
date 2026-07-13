# V1 — solopreneur-income-tax (1인 사장님 종합소득세 월별 누적)

5월 종소세 신고를 직접 하는 프리랜서·1인 사업자가 매월 한 장씩 누적 정리해두면 신고 시즌에 자료 모으기가 없다. Claude Code 가 전월 거래·세금계산서·현금영수증을 종소세 신고서 항목 기준 markdown 한 장으로 정리.

## 입력

- ContractRecord:
  - `bank.transactions.cb.v1` (수입·지출 구분용)
  - `hometax.tax-invoices.sales.v1`, `hometax.tax-invoices.purchase.v1`
  - `hometax.cash-receipts.sales.v1`, `hometax.cash-receipts.purchase.v1`
- 대상 기간: 전월 1일 ~ 말일
- 자격증명: 주거래은행 1개 + 홈택스 1장

## 절차

### 1. 기간 결정

```bash
PREV_YM=$(date -u -d '1 month ago' +%Y-%m)
PREV_START=$(date -u -d "${PREV_YM}-01" +%Y-%m-%d)
PREV_END=$(date -u -d "${PREV_YM}-01 +1 month -1 day" +%Y-%m-%d)
OUT_DIR="${INTERNAL_FINANCE_OUTPUT_DIR:-./out}/income-tax"
mkdir -p "$OUT_DIR"
```

### 2. 5종 데이터 수집

```bash
h6s fetch bank.transactions.cb.v1 --month "$PREV_YM" \
  --output jsonl --save "$OUT_DIR/$PREV_YM-bank.jsonl" --quiet &

for SCHEMA in \
  hometax.tax-invoices.sales.v1 \
  hometax.tax-invoices.purchase.v1 \
  hometax.cash-receipts.sales.v1 \
  hometax.cash-receipts.purchase.v1; do
  h6s fetch "$SCHEMA" --from "$PREV_START" --to "$PREV_END" \
    --output jsonl --save "$OUT_DIR/$PREV_YM-$(echo $SCHEMA | tr . -).jsonl" --quiet &
done
wait
```

### 3. 신고 항목별 집계

종소세 신고서 항목과 매핑 (단순화 — 사업소득자 기준):

| 신고서 항목 | 계산 |
|---|---|
| 사업 수입금액 | 세금계산서 매출 + 현금영수증 매출 + 은행 입금 중 사업 적요 매칭 |
| 매출원가/매입비용 | 세금계산서 매입 + 현금영수증 매입 |
| 일반 경비 | 은행 출금 중 `*임대료*`, `*전기료*`, `*통신*`, `*SaaS*`, `*광고*` 매칭 |
| 인건비 (있다면) | 은행 출금 `*급여*`, `*4대보험*` |
| 카드 매입 | 은행 출금 `*카드결제*` |
| 가지급 (자기 송금) | 직원/대표 인명 송금 (가지급금 추적) |

[conventions.md § 계정과목 분류 룰북](conventions.md#계정과목-분류-룰북-분개-제안용) 의 일반 룰을 1인 사업자 맥락에 그대로 적용.

### 4. Markdown 누적

`$OUT_DIR/income-tax-$PREV_YM.md` 한 장 생성 (덮어쓰기). 누적은 한 폴더 안 월별 파일 다발 형태 — 신고 시즌에 `cat 2025-*.md > 2025-summary.md` 한 번에 합치기 좋다.

```markdown
# 종소세 자료 — 2026-04

| 항목 | 금액 | 비고 |
|---|---|---|
| 사업 수입금액 | 18,420,000 | 세계산 매출 14,200,000 + 현금영수증 매출 2,200,000 + 은행 입금 사업 매칭 2,020,000 |
| 매출원가/매입비용 | 4,830,000 | |
| 일반 경비 | 2,140,000 | 임대료/통신/SaaS/광고 |
| ... | ... | |

> 자동 생성 — 검증은 사람이 PR review 단계에서.
```

### 5. 사용자에게 한 줄 보고

```
V1 solopreneur-income-tax (${PREV_YM}): 수입 18,420,000 / 비용 6,970,000
$OUT_DIR/income-tax-${PREV_YM}.md 갱신 — 5월 종소세 시즌까지 매월 누적
```

## 운영 주기

매월 1일 (전월 데이터 확정 후). GitHub Actions cron 자동화 권장 — `internal-finance` 의 weekly-backup 패턴을 응용.

## 검증 (Stage 1)

1. 첫 3개월: 사람이 매월 결과를 회계 도구(컴퓨테이션·홈택스 e-경비) 와 대조
2. 매출/매입 합계가 ±1% 안에 들면 자동 누적 신뢰
3. 12개월 누적 후 종소세 신고 시 실제 세무사 검토 결과와 차이 ≤ 3% 목표

## 에러 처리

| 상황 | 대응 |
|---|---|
| 일부 schema 0건 (면세 사업자 등) | 정상 — md 에 "(해당 없음)" 표시 |
| 가지급 송금 패턴 모호 | "검토 필요" 컬럼에 별도 표시 |
| 은행 거래의 사업/개인 구분 모호 | 적요 패턴 매칭 신뢰도 < 70% 면 "수기 분류 필요" 별도 |
