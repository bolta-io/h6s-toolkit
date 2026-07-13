# P9 — saas-weekly-cashflow-burn (SaaS 주간 번/런웨이 Slack)

매주 월요일 09:00 KST에 지난 주 net 캐시 변화를 지정한 슬랙 채널에 한 줄로 보냅니다. 4주 평균 번과 추정 runway까지 함께 전달합니다.

## 자동 트리거 키워드

"SaaS runway", "주간 캐시플로우 Slack", "번 알림", "월요일 캐시 보고", "캐시 사이클 자동화"

## 입력 / 출력

| | 값 |
|---|---|
| Schema | `bank.transactions.cb.v1` |
| Provider | 운영 은행 (예: `CB_KB`) |
| 기간 | 지난 주 (월~일) |
| 추가 입력 | `vars.SAAS_OPERATING_BALANCE` (잔액, 운영자가 매주 갱신) 또는 별도 `bank.accounts.cb.v1` fetch step |
| 출력 | Slack 메시지 (지정 채널) |

## 핵심 step 발췌

```yaml
- id: prev-week
  run: |
    MON=$(date -u -d 'last monday -7 days' +%Y-%m-%d)
    SUN=$(date -u -d "$MON +6 days" +%Y-%m-%d)
    WEEK=$(date -u -d "$MON" +%G-W%V)
    echo "mon=${MON}"   >> "$GITHUB_OUTPUT"
    echo "sun=${SUN}"   >> "$GITHUB_OUTPUT"
    echo "week=${WEEK}" >> "$GITHUB_OUTPUT"

- id: fetch
  uses: bolta-io/h6s-action@v2
  with:
    api-key: ${{ secrets.H6S_API_KEY }}
    schema: bank.transactions.cb.v1
    provider: CB_KB
    from: ${{ steps.prev-week.outputs.mon }}
    to: ${{ steps.prev-week.outputs.sun }}

- name: net/번/runway 계산
  id: cashflow
  run: node scripts/saas-cashflow.mjs --bank ${{ steps.fetch.outputs.path }} --balance ${{ vars.SAAS_OPERATING_BALANCE }} >> "$GITHUB_OUTPUT"

- uses: slackapi/slack-github-action@v1
  with:
    channel-id: ${{ vars.SLACK_CHANNEL_ID }}
    slack-message: |
      📊 주간 캐시 · ${{ steps.prev-week.outputs.week }}
      Net 변화 ${{ steps.cashflow.outputs.net_change }}
      누적 번(4주 평균) ${{ steps.cashflow.outputs.weekly_burn_4w_avg }} · runway 약 ${{ steps.cashflow.outputs.runway_months }}개월
```

`scripts/saas-cashflow.mjs` 본문 알고리즘은 `mcp-finance` 의 M3 (`scenario-saas-cash-cycle.md`) 의 계산 항목을 그대로 옮긴 형태.

## 본문 yml

[`../../../h6s-action/examples/saas-cashflow.yml`](../../../h6s-action/examples/saas-cashflow.yml)

## 응용 팁

- **잔액 자동화**: `vars.SAAS_OPERATING_BALANCE` 대신 `bank.accounts.cb.v1` fetch step 추가 → 잔액 조회 권한이 자격증명에 있어야 함
- **다중 은행 합산**: multi-provider matrix 패턴을 cashflow 계산 step 에서 통합
- **월말 종합**: cron 을 매월 1일도 트리거하도록 추가하고 `--period=monthly` 같은 분기 처리
- **Notion 누적**: Slack 대신/추가로 Notion DB 페이지 생성 (`internal-finance` § Notion 출력 템플릿 재사용)
