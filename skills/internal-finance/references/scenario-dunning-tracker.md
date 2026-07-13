# A3 — dunning-tracker (미수금 추적)

A2 매출 대사의 미매칭 + 후보 결과를 누적해서 30/60/90일 연체 구간으로 분류. 담당자별 Slack DM + 독촉 메일 초안 자동 생성.

## 입력

- A2 reconcile-sales 의 Notion DB(`NOTION_DB_RECONCILE_SALES`) — `미매칭` 또는 `후보` 상태
- 팀 거래처 DB (`INTERNAL_VENDOR_LIST_PATH`) — 담당자·연락처 매핑
- (선택) 새로 발생한 매출 세금계산서 — 최근 90일 분 (`hometax.tax-invoices.sales.v1` 재수집해 결제기한 갱신)

## 절차

### 1. Notion DB 에서 미수금 후보 조회

```bash
curl -sX POST "https://api.notion.com/v1/databases/$NOTION_DB_RECONCILE_SALES/query" \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H 'Notion-Version: 2022-06-28' \
  -H 'Content-Type: application/json' \
  -d '{
    "filter": {
      "or": [
        { "property": "Status", "select": { "equals": "미매칭" } },
        { "property": "Status", "select": { "equals": "후보" } }
      ]
    }
  }' > "$OUT_DIR/dunning-candidates.json"
```

### 2. 최신 입금 재확인 (A2 가 놓친 매칭 회수)

A2 마지막 실행 이후 새로 발생한 입금이 있으면 미수금 후보를 재매칭. 같은 매칭 알고리즘([scenario-reconcile-sales.md § 2 매칭 알고리즘](scenario-reconcile-sales.md#2-매칭-알고리즘)) 을 다시 적용. 매칭되면 Notion 페이지의 Status 를 `매칭완료` 로 update 하고 후속 단계에서 제외.

```bash
SCAN_START=$(date -v-30d +%F)
SCAN_END=$(date +%F)
for PROVIDER in CB_KB CB_SHINHAN ...; do
  h6s fetch bank.transactions.cb.v1 --provider "$PROVIDER" \
    --from "$SCAN_START" --to "$SCAN_END" \
    --output jsonl --save "$OUT_DIR/dunning-recent-inflow-$PROVIDER.jsonl" --quiet &
done
wait
```

### 3. 연체 구간 분류

각 미수금에 대해 경과일 계산:

```
경과일 = (오늘) - (세금계산서 작성일) - (결제기한)
```

결제기한은 거래처 DB 의 `default_payment_terms` (기본 30일). 거래처별 합의 기한이 있으면 그 값.

| 경과일 | Aging Bucket |
|---|---|
| < 0 | `미도래` (아직 결제기한 전, 정상) — 후속 단계에서 제외 |
| 0 ~ 29 | `30일` |
| 30 ~ 59 | `60일` |
| ≥ 60 | `90일+` |

### 4. 독촉 메일 초안 생성 (AI)

각 `30일` 이상 연체 건에 대해 거래처·금액·발행일·연체일·결제기한을 입력으로 정중한 한국어 독촉 메일 초안 작성. 톤은 거래 단계별로:

- `30일`: 안내성 (실수 가능성 환기, 부드러운 톤)
- `60일`: 확인 요청 (구체적 회신 기한 명시)
- `90일+`: 공식 통보 (대표·법무 참조 안내)

초안은 다음 두 곳에 저장:
- Gmail draft API (`SLACK_BOT_TOKEN` 같이 `GMAIL_*` 환경변수가 등록되어 있을 때만)
- 그 외에는 팀 비밀 저장소(1Password vault 등) → "Dunning Drafts" item 으로 저장 (또는 stdout fallback)

### 5. Notion DB 업데이트

각 미수금 페이지에:
- `Overdue Days` 갱신
- `Aging Bucket` 갱신
- `Email Draft` URL 부착 (Gmail 또는 1Password 링크)

[output-templates.md § A3 미수금 트래커 DB](output-templates.md#a3-미수금-트래커-db-컬럼) 컬럼 매핑.

### 6. 담당자별 Slack DM

각 거래처의 담당자(`INTERNAL_VENDOR_LIST_PATH` CSV)에게 DM을 보냅니다. 한 담당자가 여러 거래처를 가지면 한 메시지로 모아 전달합니다.

[output-templates.md § Slack 미수금 DM](output-templates.md#미수금-dm-a3) 포맷.

`SLACK_WEBHOOK_URL_DUNNING` 이 등록되어 있으면 그 채널로, 아니면 `SLACK_WEBHOOK_URL` 의 기본 채널로.

### 7. CSV 저장 (감사용)

```
공급자,발행일,금액,승인번호,경과일,연체구간,담당자,마지막독촉일,메모
```

경로: `$OUT_DIR/dunning-$(date +%F).csv`.

### 8. 사용자에게 한 줄 보고

```
A3 dunning-tracker: 미수금 ${TOTAL} 건 (${TOTAL_AMOUNT} 원)
- 30일: ${B30} 건
- 60일: ${B60} 건
- 90일+: ${B90} 건
Slack DM 전송 완료 (${DM_COUNT} 명) / 독촉 메일 초안 ${DRAFT_COUNT} 건
```

## 운영 주기

주 1회 (월요일 아침 권장). 분기말 ±1주는 일 1회로 격상.

## 검증 (Stage 1)

1. 첫 1개월: 90일+ 건수 0 또는 사람의 적극 회수 진행 중 상태로 수렴
2. 독촉 메일 초안의 톤·내용을 재무 담당자가 검토 → 패턴화된 수정 요청을 [conventions.md] 보강

## 에러 처리

| 상황 | 대응 |
|---|---|
| Notion DB 빈 결과 | A2 가 한 번도 실행되지 않은 상태 — 사용자에게 "A2 reconcile-sales 먼저 실행 필요" 안내 |
| 담당자 정보 없는 거래처 | DM 대신 기본 팀 채널에 "담당자 미지정" 별도 알림 |
| Gmail draft API 실패 | 팀 비밀 저장소 또는 stdout fallback, 사용자에게 보고 |
| 같은 거래처가 30일·60일·90일+ 에 동시 분포 (서로 다른 invoice) | 한 DM 안에 buckets 별로 묶어 표시 |
