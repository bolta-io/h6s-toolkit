# P5 — ai-ledger (수집 + Claude Code Action 으로 ledger 자동 작성)

매주 월요일 KST 09:00 에 지난 주 입출금내역을 수집한 뒤, Claude Code Action 이 repo 의 `LEDGER.md` 가이드를 읽고 beancount/hledger 저널에 전표를 자동 추가한다. 대차 정합성 검증을 통과한 결과만 PR 로 올라온다.

## 자동 트리거 키워드

"AI 전표", "ledger 자동 작성", "beancount 자동", "전표 자동 분개", "Claude 로 회계", "plain-text accounting 자동화"

## 입력 / 출력

| | 값 |
|---|---|
| Schema | `bank.transactions.cb.v1` |
| Provider | 단일 (예: `CB_IBK`) |
| 기간 | 지난 7일 (`from: 7일 전, to: 어제`) |
| Output | `./incoming/bank/` (임시 staging) → Claude 가 처리 후 `ledger/journal/<date>.beancount` 에 전표 추가 |
| 후속 | `create-pull-request` 로 ledger 디렉터리 변경분 PR |

## 사전 준비

1. repo 에 `LEDGER.md` — 계정과목 분류 가이드, 거래처 alias 규칙, 적요 작성 룰 (Claude 가 이 문서를 읽고 분개)
2. repo 에 기존 `ledger/` 디렉터리 — Claude 가 기존 전표 양식을 학습
3. repo secret `H6S_API_KEY` + `ANTHROPIC_API_KEY` (Claude API key)

## 핵심 step 발췌

```yaml
- id: fetch
  uses: bolta-io/h6s-action@v2
  with:
    api-key: ${{ secrets.H6S_API_KEY }}
    schema: bank.transactions.cb.v1
    provider: CB_IBK
    from: ${{ steps.prev-week.outputs.from }}
    to: ${{ steps.prev-week.outputs.to }}
    output-path: ./incoming/bank/

- uses: anthropics/claude-code-action@v1
  with:
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    direct-prompt: |
      ./incoming/bank/ 의 새 CSV 파일을 읽어 ledger/journal/<날짜>.beancount 에
      전표를 추가해줘. LEDGER.md 가이드를 따라 계정 분류·적요·증빙을 작성.
      대차 정합성 검증을 통과해야 한다. 작성이 끝나면 incoming/ 디렉터리는 비워줘.

- uses: peter-evans/create-pull-request@v6
  with:
    title: 'ledger: 주간 전표 ${{ steps.fetch.outputs.summary }}'
    branch: ledger/weekly-${{ steps.fetch.outputs.job-id }}
    add-paths: |
      ledger/
      incoming/
```

## 본문 yml

[`../../../h6s-action/examples/ai-ledger-trigger.yml`](../../../h6s-action/examples/ai-ledger-trigger.yml)

## 응용 팁

- **hledger / aceledger**: prompt의 `.beancount`만 다른 포맷으로 바꾸면 됩니다. LEDGER.md 가이드도 해당 도구 문법에 맞게 작성합니다.
- **검증 단계 추가**: Claude 가 작성한 직후 별도 step 으로 `bean-check ledger/` 등 적자/문법 검증을 돌려 실패 시 PR 도 안 만들도록 차단
- **세금계산서까지**: fetch step 을 matrix 로 늘려 `hometax.tax-invoices.*.v1` 도 같이 수집한 뒤 direct-prompt 에 "세금계산서와 매칭해서 세무 관련 적요도 채워줘" 한 줄 추가
