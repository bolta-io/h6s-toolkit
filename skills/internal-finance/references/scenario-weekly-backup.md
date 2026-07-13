# C2 — weekly-backup-action (주간 입출금내역 백업)

매주 등록된 전 은행 입출금내역을 CSV 로 받아 백업 레포에 커밋. 사람 개입 없이 GitHub Actions cron 으로 무인 실행.

## 입력

- ContractRecord: `bank.transactions.cb.v1` + `bank.accounts.cb.v1`
- 대상 기간: 지난 1주일 (지난 월요일 ~ 어제)
- 대상 자격증명: 등록된 전 은행

## 절차

### 1. 운영자 단말에서 1회 실행 (Stage 1 검증)

GitHub Actions 자동화 전에 운영자 단말에서 한 번 실행해 결과 확인:

```bash
WEEK_START=$(date -v-monday -v-7d +%F)
WEEK_END=$(date -v-1d +%F)
OUT_DIR="${INTERNAL_FINANCE_OUTPUT_DIR:-./out}"
mkdir -p "$OUT_DIR"

for PROVIDER in CB_KB CB_SHINHAN CB_WOORI ...; do
  h6s fetch bank.transactions.cb.v1 --provider "$PROVIDER" \
    --from "$WEEK_START" --to "$WEEK_END" \
    --output csv --save "$OUT_DIR/weekly-tx-$WEEK_END-$PROVIDER.csv" --quiet &
done
wait

# 계좌 잔액 스냅샷
h6s fetch bank.accounts.cb.v1 --output csv --save "$OUT_DIR/weekly-balance-$WEEK_END.csv"
```

### 2. GitHub Actions 자동화

`github-actions/weekly-backup.yml` 을 자기 백업 레포(예: `<your-org>/finance-backup`) 의 `.github/workflows/` 에 복사.

필요한 GitHub secrets:
- `H6S_API_KEY` — 워크스페이스 키
- (선택) `SLACK_WEBHOOK_URL` — 실패 알림용

workflow 가 매주 월요일 09:00 KST 에 실행:
1. `npm i -g @h6s-ai/cli`
2. 위 1단계 명령 그대로 실행
3. `out/` 디렉토리를 git commit + push
4. (선택) Slack 으로 "주간 백업 완료" 알림

워크플로 yml: [../github-actions/weekly-backup.yml](../github-actions/weekly-backup.yml).

### 3. 백업 레포 구조 (권장)

```
<your-org>/finance-backup/
├── .github/workflows/weekly-backup.yml
├── README.md
└── out/
    ├── weekly-tx-2026-04-13-CB_KB.csv
    ├── weekly-tx-2026-04-13-CB_SHINHAN.csv
    ├── weekly-balance-2026-04-13.csv
    ├── weekly-tx-2026-04-20-CB_KB.csv
    └── ...
```

CSV 는 UTF-8 BOM + 한국어 헤더 (CLI 의 `--output csv` 기본). 엑셀에서 그대로 열림.

### 4. 사용자에게 한 줄 보고 (수동 실행 시)

```
C2 weekly-backup-action (${WEEK_START} ~ ${WEEK_END}): ${BANK_COUNT} 은행 / ${TX_COUNT} 건
CSV ${OUT_DIR} 에 저장
GitHub Actions 등록 다음 단계: ../github-actions/weekly-backup.yml 을 백업 레포에 복사
```

## 운영 주기

주 1회 (월요일 09:00 KST). cron: `0 0 * * 1` (UTC).

## 검증 (Stage 1)

1. 1주일간 운영자가 수동 실행 → CSV 검증
2. 누적 4주 후 GitHub Actions 등록 → 자동 실행 검증
3. 자격증명 만료(`CERT_EXPIRED`) 시 cron 이 알림 보내는지 확인

## 에러 처리

| 상황 | 대응 |
|---|---|
| GitHub Actions 에서 `CERT_EXPIRED` | Slack 으로 즉시 알림 + workflow 실패 처리 |
| 일부 은행 실패 | 나머지 은행만 백업 + 실패 은행 목록 commit message 에 명시 |
| 거래 0건 (휴일 주) | 빈 CSV 도 그대로 commit (감사 추적용) |
| commit conflict | 수동 개입 — Actions 가 자동 resolve 시도 안 함 |
