# P7 — ecommerce-settlement-pr (이커머스 PG-은행 월말 정산 차이 PR)

매월 1일 KST 09:00 에 전월 PG 정산 합계와 은행 입금 합계의 일자별 차이만 추려 PR 로 올린다. 차이가 0 이면 PR 자체가 생성되지 않는다 (변경 없음 → create-pull-request skip).

## 자동 트리거 키워드

"PG 정산 PR", "월말 정산 차이", "스마트스토어 대사", "네이버페이 정산 PR", "이커머스 월말 마감"

## 입력 / 출력

| | 값 |
|---|---|
| Schema | `bank.transactions.cb.v1` |
| Provider | 운영 은행 1개 (예: `CB_KB`) |
| 기간 | 전월 1일~말일 (`from`/`to`) |
| 추가 입력 | `./incoming/pg-settlement/<YYYY-MM>/*.csv` (운영자가 PG 사이트에서 다운) |
| Output | `./settlement/<YYYY-MM>/` 디렉터리에 차이 CSV + 요약 md |
| 후속 | `peter-evans/create-pull-request@v6` (차이 0 이면 skip) |

## 핵심 step 발췌

```yaml
- id: prev-month
  run: |
    MONTH=$(date -u -d '1 month ago' +%Y-%m)
    START=$(date -u -d "${MONTH}-01" +%Y-%m-%d)
    END=$(date -u -d "${MONTH}-01 +1 month -1 day" +%Y-%m-%d)
    echo "month=${MONTH}" >> "$GITHUB_OUTPUT"
    echo "start=${START}" >> "$GITHUB_OUTPUT"
    echo "end=${END}"     >> "$GITHUB_OUTPUT"

- id: fetch
  uses: bolta-io/h6s-action@v2
  with:
    api-key: ${{ secrets.H6S_API_KEY }}
    schema: bank.transactions.cb.v1
    provider: CB_KB
    from: ${{ steps.prev-month.outputs.start }}
    to: ${{ steps.prev-month.outputs.end }}

- name: PG ↔ 은행 차이 추출
  run: node scripts/pg-bank-diff.mjs --pg ./incoming/pg-settlement/${{ steps.prev-month.outputs.month }}/ --bank ${{ steps.fetch.outputs.path }} --out ./settlement/${{ steps.prev-month.outputs.month }}/

- uses: peter-evans/create-pull-request@v6
  with:
    title: 'settlement: ${{ steps.prev-month.outputs.month }} PG-은행 차이'
    branch: settlement/${{ steps.prev-month.outputs.month }}
    add-paths: settlement/
```

`scripts/pg-bank-diff.mjs` 본문 알고리즘은 `internal-finance` 의 V2 (`scenario-ecommerce-pg-reconciliation.md`) 절차를 그대로 옮긴 형태. PG 정산서 컬럼 매핑은 팀별 룰북에 맞춰 조정.

## 본문 yml

[`../../../h6s-action/examples/ecommerce-settlement.yml`](../../../h6s-action/examples/ecommerce-settlement.yml)

## 응용 팁

- **PG 정산서 자동 수집**: PG 가 webhook 또는 API 제공 시 별도 step 으로 `./incoming/pg-settlement/` 채우기 자동화. PG 가 다양하면 PG 별 fetch step 을 matrix 로
- **운영 은행 다중**: `provider:` 만 바꾸면서 step 을 늘리거나 multi-provider 와 결합
- **Slack 동반 알림**: notify-on-fetch 패턴을 PR 단계 직후 step 으로 추가 → "이번달 차이 N건" 한 줄
