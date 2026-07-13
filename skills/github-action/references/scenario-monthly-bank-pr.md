# P1 — monthly-bank-pr (매월 입출금내역 + PR)

매월 1일 KST 09:00 에 전월 한 달치 입출금내역을 수집해 별도 브랜치에 commit, PR 로 올린다. plain-text accounting(beancount, hledger, aceledger) 워크플로우의 표준 진입점 — 사람이 PR review 단계에서 분개·계정 분류를 한 번 훑고 머지.

## 자동 트리거 키워드

"매월 입출금내역", "매월 1일", "전월 수집", "월간 입출금내역 PR", "월말 마감 자동화"

## 입력 / 출력

| | 값 |
|---|---|
| Schema | `bank.transactions.cb.v1` |
| Provider | 단일 (예: `CB_IBK`) |
| 기간 | 전월 1일~말일 (`month: $(date -u -d '1 month ago' +%Y-%m)`) |
| Output | `./data/bank/` 디렉터리에 CSV |
| 후속 | `peter-evans/create-pull-request` 로 PR 생성 |

## 핵심 step 발췌

```yaml
- id: prev-month
  run: echo "value=$(date -u -d '1 month ago' +%Y-%m)" >> "$GITHUB_OUTPUT"

- id: fetch
  uses: bolta-io/h6s-action@v2
  with:
    api-key: ${{ secrets.H6S_API_KEY }}
    schema: bank.transactions.cb.v1
    provider: CB_IBK
    month: ${{ steps.prev-month.outputs.value }}
    output-path: ./data/bank/

- uses: peter-evans/create-pull-request@v6
  with:
    title: '입출금내역 ${{ steps.fetch.outputs.summary }}'
    branch: data/bank-${{ steps.fetch.outputs.job-id }}
    add-paths: data/
```

`steps.fetch.outputs.summary`는 `"bank.transactions.cb.v1: 47건 (2026-03)"` 같은 한 줄 텍스트입니다. PR 제목·body에 그대로 넣으면 어떤 잡인지 한눈에 보입니다.

## 본문 yml

[`../../../h6s-action/examples/monthly-bank-collect.yml`](../../../h6s-action/examples/monthly-bank-collect.yml)

## 응용 팁

- **다른 은행으로 바꾸기**: `provider:`만 바꾸면 됩니다. `CB_KB`, `CB_SHINHAN`, `CB_WOORI` 등. credential은 워크스페이스에 등록된 매칭 1건이 자동 선택됩니다.
- **dateRange 직접 지정**: 월 단위가 아니라 임의 기간이면 `month:` 대신 `from: 2026-03-15` + `to: 2026-04-14` 조합
- **PR 대신 자동 commit**: `create-pull-request` step 을 빼고 `git config user.name ... && git add data/ && git commit -m ... && git push` step 으로 교체. `permissions: contents: write` 만 있으면 동작
