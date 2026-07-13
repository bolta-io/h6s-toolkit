# P6 — multi-provider (다중 기관 병렬 수집)

여러 은행 입출금내역을 `strategy.matrix` 로 병렬 수집해 provider 별로 Artifact 분리 보존. 본 계좌 + 마이크로 그랜트·피지컬 스폰서십용 분리 계좌가 서로 다른 은행에 있는 경우의 표준 패턴.

## 자동 트리거 키워드

"여러 은행", "다중 기관", "분리 계좌", "마이크로 그랜트", "스폰서십 계좌", "기관 matrix", "본 계좌 외 계좌까지"

## 입력 / 출력

| | 값 |
|---|---|
| Schema | `bank.transactions.cb.v1` (단일) |
| Provider | matrix 로 N개 (예: `CB_IBK` + `CB_KB` + `CB_SHINHAN`) |
| 기간 | 전주 (`from: 7일 전, to: 어제`) |
| Output | provider 별 디렉터리 `data/bank/<provider>/` |
| 후속 | provider 별 Artifact `bank-<provider>` (30일) |

## 핵심 step 발췌

```yaml
strategy:
  fail-fast: false
  matrix:
    provider:
      - CB_IBK      # 본 계좌
      - CB_KB       # 마이크로 그랜트 분리 계좌
      - CB_SHINHAN  # 피지컬 스폰서십 분리 계좌

steps:
  - id: fetch
    uses: bolta-io/h6s-action@v2
    with:
      api-key: ${{ secrets.H6S_API_KEY }}
      schema: bank.transactions.cb.v1
      provider: ${{ matrix.provider }}
      from: ${{ steps.prev-week.outputs.from }}
      to: ${{ steps.prev-week.outputs.to }}
      output-path: ./data/bank/${{ matrix.provider }}/

  - uses: actions/upload-artifact@v4
    with:
      name: bank-${{ matrix.provider }}
      path: ${{ steps.fetch.outputs.path }}
      retention-days: 30
```

provider만 주면 백엔드 매칭이 credential 또는 공동인증서를 자동 선택합니다 — yml에 credential-id를 지정하지 않아도 됩니다.

## 본문 yml

[`../../../h6s-action/examples/multi-provider-matrix.yml`](../../../h6s-action/examples/multi-provider-matrix.yml)

## 응용 팁

- **PR 합본 원하면**: P2 처럼 `needs: fetch` + `if: always()` 인 별도 `collect` job 을 추가해 download-artifact 후 `create-pull-request`. 그러면 provider 별 Artifact + 통합 PR 둘 다
- **provider 추가**: matrix.provider 에 한 줄만 추가. credential 이 워크스페이스에 등록돼 있어야 매칭이 되니, 단말에서 `h6s credentials list --output json` 으로 매칭 가능한지 미리 확인
- **schema 도 다르게**: matrix 를 `include:` 로 전환해 schema + provider 페어로 표현하면 P2 와 P6 가 한 워크플로우에 합쳐짐
