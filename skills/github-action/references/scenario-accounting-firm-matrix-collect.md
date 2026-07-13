# P8 — accounting-firm-matrix-collect (회계법인 다중 클라이언트 matrix 수집)

매월 1일 06:00 KST 에 N개 클라이언트 자료를 matrix 로 병렬 수집해 클라이언트별 디렉터리로 정리한 한 PR. 클라이언트당 별도 워크스페이스 = 별도 API Key 를 secrets 에 분리 등록.

## 자동 트리거 키워드

"회계법인 matrix", "다중 클라이언트 수집", "세무사 클라이언트 자료", "월말 마감 자료 PR", "client matrix"

## 입력 / 출력

| | 값 |
|---|---|
| Schema | `bank.transactions.cb.v1`, `hometax.tax-invoices.sales.v1`, `hometax.tax-invoices.purchase.v1` |
| Provider | 클라이언트별 매칭되는 코드 |
| 기간 | 전월 (`month`) |
| Output | `./clients/<code>/<YYYY-MM>/` 디렉터리 N개 |
| 후속 | matrix 결과를 `actions/download-artifact` 로 모아 한 PR |

## 보안 — secrets 분리

클라이언트별 API Key 는 secret 으로 등록:

```
H6S_API_KEY_CLIENT_A
H6S_API_KEY_CLIENT_B
H6S_API_KEY_CLIENT_C
...
```

matrix 에서 `secrets[matrix.client.api_key_secret]` 동적 접근. 같은 workflow 가 다른 클라이언트 자료를 같은 PR 에 올리지 않게 디렉터리 분리 (실수로 다른 클라이언트 자료가 한 디렉터리에 섞이면 보안 사고).

## 핵심 step 발췌

```yaml
strategy:
  fail-fast: false
  matrix:
    client:
      - { code: client-a, api_key_secret: H6S_API_KEY_CLIENT_A }
      - { code: client-b, api_key_secret: H6S_API_KEY_CLIENT_B }

- id: fetch-bank
  uses: bolta-io/h6s-action@v2
  with:
    api-key: ${{ secrets[matrix.client.api_key_secret] }}
    schema: bank.transactions.cb.v1
    provider: CB_KB
    month: ${{ steps.prev-month.outputs.value }}
    output-path: ./clients/${{ matrix.client.code }}/${{ steps.prev-month.outputs.value }}/bank/

- uses: actions/upload-artifact@v4
  with:
    name: clients-${{ matrix.client.code }}-${{ steps.prev-month.outputs.value }}
    path: ./clients/${{ matrix.client.code }}/${{ steps.prev-month.outputs.value }}/
```

별도 job(`merge-pr`) 이 `actions/download-artifact` 로 모든 클라이언트 결과를 합쳐 PR 1개로.

## 본문 yml

[`../../../h6s-action/examples/accounting-matrix.yml`](../../../h6s-action/examples/accounting-matrix.yml)

## 응용 팁

- **클라이언트 추가**: matrix 에 한 줄 추가 + secret 1개 등록. yml 외에 다른 변경 없음
- **수집 schema 추가**: matrix step 에 새 schema fetch 추가하거나 별도 matrix dimension(`schema:`) 으로 확장 (M×N matrix 폭발 주의)
- **클라이언트별 별도 PR**: 한 PR 합본 대신 클라이언트당 PR — `merge-pr` job 을 분리해 `peter-evans/create-pull-request` 를 matrix 단계에서 직접 호출
- **마스터 키**: 회계법인 콘솔에서 클라이언트 횡단 마스터 키 발급 가능 → 모든 클라이언트를 같은 키로 (단 권한 정책 검토 필수)
