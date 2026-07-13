# B2 — dept-expense-classifier (부서별/프로젝트별 지출 분류)

월간 출금 거래를 부서·프로젝트 단위로 자동 분류. 예산 대비 실적 가시화 + 초과 임박 부서 조기 경보.

## 입력

- ContractRecord: `bank.transactions.cb.v1` (출금만)
- 팀 조직도 (`INTERNAL_ORG_CHART_PATH`) — 부서·프로젝트 목록 + 코드
- 부서별 예산 (`INTERNAL_BUDGET_PATH`) — 월간 예산 한도
- 분류 룰북: [conventions.md § 계정과목 분류 룰북](conventions.md#계정과목-분류-룰북-분개-제안용) 출금 부분

## 절차

### 1. 데이터 수집

```bash
PERIOD="${PERIOD:-$(date +%Y-%m)}"  # 기본 이번 달 (월중 가시화 목적)
PERIOD_START=$(date -v1d -j -f "%Y-%m" "$PERIOD" +%F)
TODAY=$(date +%F)
OUT_DIR="${INTERNAL_FINANCE_OUTPUT_DIR:-./out}"

for PROVIDER in CB_KB CB_SHINHAN ...; do
  h6s fetch bank.transactions.cb.v1 --provider "$PROVIDER" \
    --from "$PERIOD_START" --to "$TODAY" \
    --output jsonl --save "$OUT_DIR/dept-outflow-$PERIOD-$PROVIDER.jsonl" --quiet &
done
wait
cat "$OUT_DIR"/dept-outflow-$PERIOD-*.jsonl | jq -c 'select(.amount < 0)' > "$OUT_DIR/dept-outflow-$PERIOD-all.jsonl"
```

### 2. 분류 (3단계 cascade)

각 출금 거래에 대해:

1. **거래처 룰북 매칭** — `INTERNAL_ORG_CHART_PATH` CSV 의 `vendor_pattern,department,project` 로 정규식 매칭
2. **계정과목 + 부서 룰북** — 같은 계정과목이 항상 특정 부서에 귀속되는 경우 (예: `광고선전비` → 마케팅팀)
3. **AI 추론** — 위 두 단계 미스 시 거래 적요·금액·과거 사례 보고 부서 추정 (confidence 표기)

분류 결과는 다음 셰이프:

```json
{
  "transactionAt": "...",
  "amount": -1234567,
  "description": "...",
  "department": "마케팅팀",
  "project": "Q2 캠페인" | null,
  "category": "광고선전비",
  "confidence": "rule" | "ai-high" | "ai-low"
}
```

### 3. 집계

부서별 / 프로젝트별 합계:

```
부서명,예산,사용액,잔여,사용률,상태
마케팅팀,5000000,3200000,1800000,64%,정상
영업팀,3000000,3100000,-100000,103%,초과
...
```

상태 분류:
- `정상`: 사용률 < 80%
- `주의`: 80% ~ 99%
- `초과`: ≥ 100%

### 4. Notion 또는 Slack 대시보드

대시보드 형식이라 Notion DB 보다 한 페이지 표가 적합:

- Slack: 부서별 표를 mrkdwn 으로 — 초과·주의 부서는 강조 색
- (선택) Google Sheets API 로 팀 공유 시트 갱신

```
📊 ${PERIOD} 부서별 지출 현황 (${TODAY} 기준)

부서       | 예산      | 사용액    | 사용률
마케팅팀   | 500만     | 320만     | 64%   정상
영업팀     | 300만     | 310만     | 103%  ⚠️ 초과
...
```

### 5. 미분류 거래 별도 보고

룰북 미매칭 + AI 신뢰도 낮은 거래는 별도 CSV (`dept-unclassified-$PERIOD.csv`) — 사람이 보고 룰북 추가.

### 6. 사용자에게 한 줄 보고

```
B2 dept-expense-classifier (${PERIOD} 진행 중): 부서 ${DEPT_COUNT} / 분류 ${CLASSIFIED} 건 / 미분류 ${UNCLASSIFIED} 건
초과 ${EXCEED_COUNT} 부서 / 주의 ${WARN_COUNT} 부서
```

## 운영 주기

주 1회 (매주 월요일 아침). 월말은 일 1회로 격상.

## 검증 (Stage 1)

1. 룰북 매칭률 ≥ 70% 목표
2. AI 추론 결과를 부서장이 검토 → 패턴화된 수정을 룰북에 환원
3. 예산 초과 알림이 너무 늦지 않게 (월 중순 80% 도달 시 경고)

## 에러 처리

| 상황 | 대응 |
|---|---|
| 조직도 CSV 없음 | "INTERNAL_ORG_CHART_PATH 미설정 — 룰북 분류 불가" 안내, AI 추론만 시도 |
| 예산 CSV 없음 | 사용액만 집계, 사용률·상태 칸 비움 |
| 같은 거래가 여러 부서 후보 | 가장 신뢰도 높은 1개 선택 + 비고에 다른 후보 명시 |
