# 출력 템플릿 — Slack / Notion / CSV

전 시나리오가 따르는 출력 포맷. 신규 시나리오를 추가할 때도 이 템플릿을 재사용한다.

## Slack

### 일일 거래 요약 (A1)

채널: `SLACK_WEBHOOK_URL` 이 가리키는 팀 재무 채널

```bash
curl -sX POST -H "Content-Type: application/json" "$SLACK_WEBHOOK_URL" -d @- <<EOF
{
  "text": "📊 ${REPORT_DATE} 거래 요약",
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "📊 ${REPORT_DATE} 거래 요약" }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*입금 합계*\n${INFLOW_TOTAL} 원 (${INFLOW_COUNT} 건)" },
        { "type": "mrkdwn", "text": "*출금 합계*\n${OUTFLOW_TOTAL} 원 (${OUTFLOW_COUNT} 건)" }
      ]
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*분개 후보*: ${CSV_PATH}\n*미분류*: ${UNCLASSIFIED_COUNT} 건" }
    }
  ]
}
EOF
```

### 미수금 DM (A3)

채널: `SLACK_WEBHOOK_URL_DUNNING` (없으면 `SLACK_WEBHOOK_URL`)

```json
{
  "text": "🔔 미수금 알림 — ${OWNER}",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*${VENDOR_NAME}* — ${AMOUNT}원 *${OVERDUE_DAYS}일* 연체\n발행일: ${ISSUE_DATE} / 세금계산서 #${INVOICE_ID}\n독촉 메일 초안: ${EMAIL_DRAFT_URL}"
      }
    }
  ]
}
```

### 결과 보고 (B1, B2, B3)

```json
{
  "text": "✅ ${SCENARIO_NAME} 완료",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*기간*: ${PERIOD}\n*결과*: ${SUMMARY_LINE}\n*상세*: ${NOTION_URL} 또는 ${CSV_PATH}"
      }
    }
  ]
}
```

## Notion

Notion API integration 토큰(`NOTION_TOKEN`) + DB ID 환경변수로 페이지 생성.

### A2 미매칭 매출 DB 컬럼

| 컬럼 | 타입 | 채우는 값 |
|---|---|---|
| Vendor | Title | 공급받는자 상호 |
| Invoice Date | Date | 세금계산서 작성일 |
| Amount | Number | 합계금액 (원) |
| Invoice ID | Text | NTS 승인번호 |
| Status | Select | `미매칭` / `후보` / `매칭완료` |
| Notes | Rich text | AI 매칭 후보 (있으면) |
| Assignee | Person | 담당자 |

### A3 미수금 트래커 DB 컬럼

A2 컬럼 + 다음 추가:

| 컬럼 | 타입 | 채우는 값 |
|---|---|---|
| Overdue Days | Number | 자동 계산 (오늘 - 발행일 - 결제기한) |
| Aging Bucket | Select | `30일` / `60일` / `90일+` |
| Last Contact | Date | 마지막 독촉 일자 |
| Email Draft | URL | Gmail draft 또는 1Password vault link |

### A4 미매칭 매입 DB 컬럼

| 컬럼 | 타입 | 채우는 값 |
|---|---|---|
| Vendor | Title | 공급자 상호 |
| Invoice Date | Date | 매입 세금계산서 작성일 |
| Amount | Number | 합계금액 |
| Invoice ID | Text | NTS 승인번호 |
| Category | Select | `곧 송금` / `무계산서 지출` / `보류` |
| Expected Outflow Date | Date | 예상 송금일 (Category=곧 송금일 때) |
| Notes | Rich text | 사람 검토 메모 |

### Notion 페이지 생성 명령 (공통)

```bash
curl -sX POST 'https://api.notion.com/v1/pages' \
  -H "Authorization: Bearer $NOTION_TOKEN" \
  -H 'Notion-Version: 2022-06-28' \
  -H 'Content-Type: application/json' \
  -d @- <<EOF
{
  "parent": { "database_id": "${NOTION_DB_RECONCILE_SALES}" },
  "properties": {
    "Vendor": { "title": [{ "text": { "content": "${VENDOR}" } }] },
    "Invoice Date": { "date": { "start": "${INVOICE_DATE}" } },
    "Amount": { "number": ${AMOUNT} },
    "Invoice ID": { "rich_text": [{ "text": { "content": "${INVOICE_ID}" } }] },
    "Status": { "select": { "name": "미매칭" } }
  }
}
EOF
```

## CSV

전 시나리오 공통 파일명 패턴:

```
${INTERNAL_FINANCE_OUTPUT_DIR:-./out}/${SCENARIO_ID}-${PERIOD}.csv
```

예: `./out/reconcile-sales-2026-04.csv`, `./out/daily-bank-summary-2026-04-15.csv`.

UTF-8 BOM + 한국어 헤더 — 엑셀 호환. `h6s data-jobs results <jobId> --csv` 가 이 포맷을 그대로 출력하므로 raw 데이터는 그걸 쓰고, skill 의 가공 결과는 별도 CSV 로 저장.

### A1 분개 후보 CSV 컬럼

```
거래일시,계좌번호,적요,금액,잔액,제안 계정과목,신뢰도(룰/AI),비고
```

### A2 / A4 매칭 결과 CSV 컬럼

```
세금계산서일,공급자,공급받는자,금액,승인번호,매칭상태,매칭거래일,매칭금액,비고
```

매칭상태: `매칭` / `후보` / `미매칭`.

### A3 미수금 CSV 컬럼

```
공급자,발행일,금액,승인번호,경과일,연체구간,담당자,마지막독촉일,메모
```

## 한국어 라벨링 원칙

- 통화: `1,234,567 원` (천 단위 콤마 + 공백 + `원`)
- 날짜: `2026-04-15` (ISO 8601)
- 거래처: 법인 접두/접미사 포함 원본 그대로 표기 (매칭 키는 정규화하되 표시는 raw)
- 사업자등록번호: `123-45-67890` (3-2-5 하이픈)
- 승인번호 / 세금계산서 ID: 원본 그대로 (NTS 형식 유지)

## 비대화형 실행 시 출력

Slack/Notion 호출이 실패해도 시나리오는 끝까지 실행. 실패는 stderr 에 한 줄로 기록하고 CSV/stdout 으로 fallback. 마지막에 "Slack 전송 실패 N건 / Notion 전송 실패 M건" 요약을 stdout 마지막 줄에 출력.
