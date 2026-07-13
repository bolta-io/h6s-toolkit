# P4 — upload-artifact (감사·재실행용 Artifact 보존)

수집 결과를 repo 에 commit 하지 않고 GitHub Artifact 로 90일간 보존. PR 리뷰가 불필요하고, 감사·재실행·로컬 다운로드만 목적인 경우.

## 자동 트리거 키워드

"artifact 보존", "PR 없이 보관", "감사용 백업", "재실행용", "90일 보존", "다운로드만"

## 입력 / 출력

| | 값 |
|---|---|
| Schema | 임의 (예시는 `bank.transactions.cb.v1`) |
| Provider | 임의 (예시는 `CB_IBK`) |
| 기간 | 전월 (`month: $(date -u -d '1 month ago' +%Y-%m)`) |
| Output | GitHub Artifact `h6s-bank-<YYYY-MM>` (90일 retention) |
| 후속 | 없음 — Artifact 가 결과 |

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

- uses: actions/upload-artifact@v4
  with:
    name: h6s-bank-${{ steps.prev-month.outputs.value }}
    path: ${{ steps.fetch.outputs.path }}
    retention-days: 90
    if-no-files-found: error
```

`if-no-files-found: error` 가 안전망 — fetch 가 성공 처리됐는데 빈 결과가 나오는 corner case 를 잡아준다.

## 본문 yml

[`../../../h6s-action/examples/upload-artifact.yml`](../../../h6s-action/examples/upload-artifact.yml)

## 응용 팁

- **여러 결과 묶기**: P6 처럼 matrix 로 provider 별 수집 후 각각 upload-artifact 하면 한 workflow run 에 여러 artifact 가 매달림
- **retention 늘리기**: GitHub Free/Pro 는 최대 90일, Enterprise 는 400일까지 설정 가능. 그 이상 장기 보존이 필요하면 별도 S3 업로드 step 으로 교체
- **다운로드**: 콘솔에서 `Actions → 해당 run → Artifacts` 클릭 또는 `gh run download <run-id> --name h6s-bank-<YYYY-MM>`
