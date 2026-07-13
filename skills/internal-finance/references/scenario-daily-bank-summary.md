# A1 — daily-bank-summary

매일 다은행 입출금내역을 받아 분개 후보를 제안하고 팀 재무 Slack 채널에 요약을 보냅니다.

## 입력

- ContractRecord: `bank.transactions.cb.v1` (BankTransactionV1Record)
- 대상 기간: 사용자가 명시하지 않았으면 어제 1일 (`--from $(date -v-1d +%F) --to $(date -v-1d +%F)`)
- 대상 자격증명: 등록된 모든 은행 자격증명 (`h6s credentials list` 의 BANK 타입 전체)

## 절차

### 1. 자격증명·대상 은행 식별

```bash
h6s credentials list --output json | jq '[.credentials[] | select(.authMethod | test("CERT|ID")) | {id, providerCode, displayName}]'
```

여러 은행 자격증명이 있으면 모두 순회. 사용자가 특정 은행만 지정했으면 그것만.

### 2. 입출금내역 수집 (은행별 병렬 fetch)

```bash
TARGET_DATE=$(date -v-1d +%F)  # 기본 어제. 사용자 지정 시 그 값
OUT_DIR="${INTERNAL_FINANCE_OUTPUT_DIR:-./out}"
mkdir -p "$OUT_DIR"

# 은행별로 반복 — provider 코드 목록은 1단계 결과에서
for PROVIDER in CB_KB CB_SHINHAN CB_WOORI CB_IBK ...; do
  h6s fetch bank.transactions.cb.v1 \
    --provider "$PROVIDER" \
    --from "$TARGET_DATE" --to "$TARGET_DATE" \
    --output jsonl \
    --save "$OUT_DIR/daily-bank-summary-$TARGET_DATE-$PROVIDER.jsonl" \
    --quiet --no-color &
done
wait
```

빈 결과(거래 0건) 은행도 결과 파일에 포함 — 빈 파일이면 후속 단계가 skip.

### 3. 거래 정규화 + 통합

```bash
# 모든 은행 jsonl 을 한 파일로 합치고, provider 코드를 보존
for f in "$OUT_DIR"/daily-bank-summary-$TARGET_DATE-*.jsonl; do
  PROVIDER=$(basename "$f" .jsonl | sed "s/daily-bank-summary-$TARGET_DATE-//")
  jq -c --arg p "$PROVIDER" '. + {providerCode: $p}' "$f"
done > "$OUT_DIR/daily-bank-summary-$TARGET_DATE-all.jsonl"
```

### 4. 분개 후보 제안

각 거래에 대해 [conventions.md](conventions.md) § 계정과목 분류 룰북 을 먼저 적용. 룰 매칭이 없거나 `미분류` 면 Claude 가 직접 다음 정보를 보고 계정과목을 제안한다:

- `description` (적요)
- `amount` (음수 = 출금, 양수 = 입금 — Hibernate 응답 부호 확인)
- 거래 시각 (`transactionAt`)
- 팀 거래처 DB (`INTERNAL_VENDOR_LIST_PATH` 환경변수, 없으면 skip)

제안 결과는 다음 셰이프:

```json
{
  "transactionAt": "2026-04-15T09:30:00+09:00",
  "providerCode": "CB_KB",
  "accountNumber": "110-...",
  "description": "해외 SaaS 결제",
  "amount": -1234567,
  "balance": 98765432,
  "suggestedAccount": "지급수수료 (소프트웨어)",
  "confidence": "rule",  // 또는 "ai-high" / "ai-low"
  "note": ""
}
```

### 5. CSV 저장

```bash
OUT_CSV="$OUT_DIR/daily-bank-summary-$TARGET_DATE.csv"
# 헤더: 거래일시,계좌번호,적요,금액,잔액,제안 계정과목,신뢰도(룰/AI),비고
# UTF-8 BOM 부착
printf '\xEF\xBB\xBF' > "$OUT_CSV"
echo "거래일시,계좌번호,적요,금액,잔액,제안 계정과목,신뢰도(룰/AI),비고" >> "$OUT_CSV"
# 위 4단계 결과를 CSV 로 직렬화 — jq 또는 임시 python/awk
```

### 6. Slack 요약 전송

집계:
- 입금 합계 / 입금 건수
- 출금 합계 / 출금 건수
- 미분류 건수
- 상위 5개 금액 거래 (간단히 인용)

[output-templates.md § Slack 일일 거래 요약](output-templates.md#일일-거래-요약-a1) 의 블록 사용.

`SLACK_WEBHOOK_URL` 누락 시 stdout 으로 같은 요약 출력 + "Slack 전송 skip (SLACK_WEBHOOK_URL 미설정)" 한 줄.

### 7. 사용자에게 한 줄 보고

```
A1 daily-bank-summary: 4 은행 / 23 건 ($OUT_CSV) — Slack 전송 완료
미분류 거래 2건은 사람 검토 필요: 해외 SaaS 결제 / 지급수수료 후보, 온라인 광고비 / 광고선전비 후보
```

## 운영 주기

매일. GitHub Actions cron 자동화 가능하나 초기 검증 기간에는 운영자 단말에서 수동 실행 권장 (분개 룰북 갱신 시 빠른 학습 루프).

## 검증 (Stage 1)

1. 1주일간 매일 운영자가 수동 호출 → CSV 확인 → 분개 정확도 ≥ 90% 인지 사람 검토
2. 룰북 매칭률이 70% 이상이고 AI 추론 신뢰도 평균 0.85 이상이면 룰북 보강 단계로 진입
3. 룰북에 새 패턴을 추가했으면 [conventions.md § 계정과목 분류 룰북](conventions.md#계정과목-분류-룰북-분개-제안용) 갱신

## 에러 처리

| 상황 | 대응 |
|---|---|
| 일부 은행만 `CREDENTIAL_PROBE_FAILED` | 그 은행은 skip 하고 나머지 진행. Slack 메시지에 "은행 N개 수집 실패" 별도 표시 |
| 모든 은행 실패 | 시나리오 중단 + 사용자 보고 |
| 거래 0건 (전 은행) | Slack 에 "거래 0건 — 휴일 또는 영업외 시간" 만 보내고 종료 |
