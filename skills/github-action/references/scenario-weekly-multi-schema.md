# P2 — weekly-multi-schema (주간 다종 schema matrix)

매주 월요일 KST 09:00 에 은행 입출금내역 + 매출·매입 세금계산서 + 매출·매입 현금영수증을 `strategy.matrix` 로 병렬 수집해 단일 PR 에 합본. 회계담당이 매주 PR 하나만 review 하면 그 주의 모든 외부 데이터가 한 번에 들어온다.

## 자동 트리거 키워드

"주간 수집", "은행 + 홈택스", "다종 schema", "matrix 수집", "여러 데이터 한 번에", "주간 합본 PR"

## 입력 / 출력

| | 값 |
|---|---|
| Schema | 5개 — `bank.transactions.cb.v1`, `hometax.tax-invoices.{sales,purchase}.v1`, `hometax.cash-receipts.{sales,purchase}.v1` |
| Provider | 은행 1개 + `HOMETAX` |
| 기간 | 전주 (`from: 7일 전, to: 어제`) |
| Output | `data/bank/`, `data/hometax/{sales,purchase,cash-receipts-sales,cash-receipts-purchase}/` |
| 후속 | `actions/upload-artifact` 로 5개 별도 보관 → `collect` job 이 download-artifact 후 PR 1개 |

## 핵심 step 발췌

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - { schema: bank.transactions.cb.v1, provider: CB_IBK, dir: data/bank/ }
      - { schema: hometax.tax-invoices.sales.v1, provider: HOMETAX, dir: data/hometax/sales/ }
      - { schema: hometax.tax-invoices.purchase.v1, provider: HOMETAX, dir: data/hometax/purchase/ }
      # ... cash-receipts.{sales,purchase} 두 줄 더

steps:
  - id: fetch
    uses: bolta-io/h6s-action@v2
    with:
      api-key: ${{ secrets.H6S_API_KEY }}
      schema: ${{ matrix.schema }}
      provider: ${{ matrix.provider }}
      from: ${{ steps.prev-week.outputs.from }}
      to: ${{ steps.prev-week.outputs.to }}
      output-path: ${{ matrix.dir }}

  - uses: actions/upload-artifact@v4
    with:
      name: ${{ matrix.schema }}
      path: ${{ steps.fetch.outputs.path }}
```

별도 `collect` job 이 `needs: fetch` + `if: always()` 로 따라붙어 download-artifact 후 디렉터리 재배치하고 `create-pull-request` 로 PR 1개 생성.

## 본문 yml

[`../../../h6s-action/examples/weekly-multi-schema.yml`](../../../h6s-action/examples/weekly-multi-schema.yml)

## 응용 팁

- **schema 줄이기**: 홈택스가 필요 없으면 `matrix.include` 에서 그 줄만 빼면 됨. 한 줄 빼도 collect job 의 mkdir / cp 가 `2>/dev/null || true` 로 감싸져 있어 그대로 동작
- **fail-fast 정책**: 기본값 `false` 라 한 schema 가 실패해도 나머지는 계속. 한 schema 라도 실패면 전체 중단을 원하면 `fail-fast: true`
- **다른 은행도 한 matrix 에**: matrix 행에 provider 만 다르고 schema 같은 줄을 추가하면 다중 은행 + 홈택스 합본도 가능. 단 디렉터리 충돌이 안 나게 `dir:` 을 provider 별로 분리
