# V2 — ecommerce-pg-reconciliation (이커머스 PG ↔ 은행 정산 대사)

PG(네이버페이·카카오페이·토스·스마트스토어 등) 정산서와 은행 실입금을 일자별로 매칭해 차이만 CSV 로 추린다. 회계담당자가 매주 한 번 받아 보면 PG 미정산·이체 누락을 즉시 발견.

## 입력

- ContractRecord: `bank.transactions.cb.v1` (운영 은행 입금)
- PG 정산서: 운영자가 별도 폴더에 다운받아 둠 (`./incoming/pg-settlement/*.csv` 등)
- 대상 기간: 지난 주 (월요일 ~ 일요일)
- 자격증명: 운영 은행 1개

## 절차

### 1. 기간 결정

```bash
LAST_MON=$(date -u -d 'last monday' +%Y-%m-%d)
LAST_SUN=$(date -u -d "$LAST_MON +6 days" +%Y-%m-%d)
WEEK=$(date -u -d "$LAST_MON" +%G-W%V)
OUT_DIR="${INTERNAL_FINANCE_OUTPUT_DIR:-./out}/pg-recon"
mkdir -p "$OUT_DIR"
```

### 2. 은행 입금 수집

```bash
h6s fetch bank.transactions.cb.v1 \
  --from "$LAST_MON" --to "$LAST_SUN" \
  --output jsonl --save "$OUT_DIR/$WEEK-bank.jsonl" --quiet
```

입금만 추출(`amount > 0`).

### 3. PG 정산서 정규화

운영자가 PG 사이트에서 받은 정산서(CSV)는 형식이 PG 별로 다르다. `./incoming/pg-settlement/<pg>-<주차>.csv` 표준화 폴더로 들어온다고 가정하고, PG 별 파서로 다음 표준 셰이프로 변환:

```json
{
  "settlementDate": "2026-04-29",
  "pgVendor": "naverpay",
  "expectedAmount": 1840200,
  "txCount": 12,
  "rawRef": "원본 CSV row id"
}
```

지원 PG 목록과 컬럼 매핑은 `${ECOMMERCE_PG_PARSER_MAP_PATH}` 환경변수로 외부에서 주입(레포에 직접 두지 않는다).

### 4. 일자별 매칭

```text
for each (pgSettlement, expectedDate):
  match = bankIncome where (depositDate in [expectedDate, expectedDate+2]) and (description ~ pgVendor)
  if exact: status = OK
  if amount diff > 1원 within ±2 영업일 window: status = GAP
  if no match within 3 영업일: status = MISSING
```

매칭 키는 (PG 이름 + 금액 + 일자) 3개. 적요(`description`) 매칭은 사용자 PG 별 표기(예: `네이버파이낸셜`, `(주)네이버파이낸셜`, `NAVER`) 를 `conventions.md` § 거래처명 변형에 추가해 누적.

### 5. CSV 저장

`$OUT_DIR/pg-bank-gap-$WEEK.csv` — 차이가 있는 일자만:

```
입금일,PG,PG 정산액,은행 실입금,차이,상태,비고
2026-04-29,naverpay,1840200,1839200,-1000,GAP,영업외 시간 환불 가능성
2026-04-30,naverpay,920000,0,-920000,MISSING,다음 영업일 (5/2 확인)
```

차이가 0이면 빈 CSV 만 생성 (헤더만). 회계담당이 "이번주 차이 없음" 을 즉시 확인.

### 6. Slack 한 줄

```
✅ 2026-W18 PG 대사 — 차이 2건 (-921,000)
naverpay GAP 1건 -1,000원
naverpay MISSING 1건 -920,000원 (다음 영업일 확인 권장)
상세: $OUT_DIR/pg-bank-gap-2026-W18.csv
```

### 7. 사용자에게 한 줄 보고

```
V2 ecommerce-pg-reconciliation (${WEEK}): 차이 ${GAP_COUNT}건 / ${MISSING_COUNT}건 누락
$OUT_DIR/pg-bank-gap-${WEEK}.csv
```

## 운영 주기

매주 월요일 09:00 KST (지난 주 정산이 모두 들어온 시점).

## 검증 (Stage 1)

1. 첫 2주: 매주 운영자가 수기로 PG 사이트에서 받은 정산서 + 은행 명세서 대조 → 자동 결과와 차이 0 확인
2. 매칭률 ≥ 95% 안정화되면 GitHub Actions cron 으로 이관 가능

## 에러 처리

| 상황 | 대응 |
|---|---|
| PG 정산서 폴더가 비어있음 | "PG 정산서 미수신 — 운영자에게 폴더 확인 요청" 알림 |
| 같은 PG·일자에 후보 2건 이상 | 큰 금액 매칭 우선 + 작은 차이는 "검토" 표시 |
| 적요 매칭 실패율 > 30% | conventions.md § PG 명칭 변형 룰 갱신 신호 |
| 은행 0건 | 휴일이면 정상, 영업일이면 시나리오 중단 + 사용자 보고 |
