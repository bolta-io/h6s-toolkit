# P3 — notify-on-fetch (수집 후 Slack 알림)

수집이 끝나면 운영 채널에 한 줄 요약을 보냅니다. 성공 / 실패 분기를 함께 다룹니다. 회계담당이 매번 GitHub Actions 페이지를 열어보지 않아도 채널에서 그 주 수집 종료 여부를 확인할 수 있습니다.

## 자동 트리거 키워드

"Slack 알림", "수집 완료 메시지", "Discord 알림", "수집 후 알림", "운영 채널 가시화"

## 입력 / 출력

| | 값 |
|---|---|
| Schema | 임의 (예시는 `bank.transactions.cb.v1`) |
| Provider | 임의 (예시는 `CB_IBK`) |
| 기간 | repo variable `vars.FETCH_FROM` / `vars.FETCH_TO` (운영자가 미리 세팅) |
| Output | (저장 없이 알림만) |
| 후속 | `slackapi/slack-github-action@v1` 으로 채널 메시지 |

## 핵심 step 발췌

```yaml
- id: fetch
  uses: bolta-io/h6s-action@v2
  with:
    api-key: ${{ secrets.H6S_API_KEY }}
    schema: bank.transactions.cb.v1
    provider: CB_IBK
    from: ${{ vars.FETCH_FROM }}
    to: ${{ vars.FETCH_TO }}

- name: Slack 알림 (성공)
  if: success()
  uses: slackapi/slack-github-action@v1
  with:
    channel-id: ${{ vars.SLACK_CHANNEL_ID }}
    slack-message: |
      headless 수집 완료
      ${{ steps.fetch.outputs.summary }}
      Job: `${{ steps.fetch.outputs.job-id }}`
  env:
    SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}

- name: Slack 알림 (실패)
  if: failure()
  uses: slackapi/slack-github-action@v1
  # ... workflow run 링크 첨부
```

## 본문 yml

[`../../../h6s-action/examples/notify-on-fetch.yml`](../../../h6s-action/examples/notify-on-fetch.yml)

## 사전 준비

1. Slack 워크스페이스에 봇 앱 만들기 → `chat:write` 스코프
2. 채널에 봇 초대
3. repo secret `SLACK_BOT_TOKEN` (xoxb-...) 등록
4. repo variable `SLACK_CHANNEL_ID` (C0123456...) 등록 — 채널 ID 는 노출돼도 되니 secret 이 아니라 variable
5. repo variable `FETCH_FROM` / `FETCH_TO` (예: `2026-04-01`, `2026-04-30`) — 운영자가 매주/매월 갱신하는 진입점

## 응용 팁

- **Discord**: `slackapi/...` step 을 빼고 `curl -X POST $DISCORD_WEBHOOK_URL -d "..."` 한 줄로 교체. `outputs.summary` 는 동일하게 사용
- **PR + 알림 동시**: P1 의 PR 생성 step 뒤에 이 시나리오의 Slack step 을 그대로 붙이면 둘 다 됨 — `success()`/`failure()` 가 같은 job 안에서는 `fetch` step 결과 기준으로 잡힘
- **기간을 매번 다르게**: variable 대신 `date -u -d` 로 동적 산출 (P1/P2 패턴 참고). variable 방식은 운영자가 손으로 통제하고 싶을 때
