---
name: h6s-data
description: headless 로 한국 금융기관(은행/홈택스/법인카드)의 입출금내역·세금계산서·현금영수증·법인카드를 받아오는 워크플로우. 사용자가 "h6s", "재무 데이터", "입출금내역", "세금계산서", "현금영수증", "은행 데이터", "홈택스", "법인카드", "카드 승인내역" 같은 키워드로 데이터 수집을 요청할 때 자동 적용.
---

# headless 데이터 수집 워크플로우

headless 의 Open REST API 를 한 줄 명령으로 호출해 한국 금융 데이터를 받아온다. AI 에이전트는 raw API 호출 대신 이 skill 의 흐름을 따라 라운드트립을 줄인다.

설치 후 자동 호출 트리거 (Claude Code 가 plugin 안의 skill 을 namespace 로 노출): **`/h6s-data:fetch`**, **`/h6s-data:start`** 등 (또는 자연어로 위 키워드 사용).

## 1. 진입 — 설치 확인 / 인증

```bash
h6s --version || npm i -g @h6s-ai/cli
h6s init       # 대화형 첫 설정 (권장) — 프로필 + 로그인 + 가용 schema 표 + 다음 명령 안내
```

`h6s init`은 Device Flow 로그인을 포함합니다. 이미 인증된 프로필이면 로그인 단계를 자동으로 skip합니다 (`--force`로 재인증 가능). 한 번 인증한 환경에서는 이 단계를 생략하고 바로 3번으로 진행할 수 있습니다.

## 2. 메타 디스커버리 (필요 시)

처음 접하는 시나리오면 한 번만 실행:

```bash
h6s ai-guide --output json          # CLI 사용 패턴
h6s providers list --output json    # 가용 금융기관
h6s schemas list --output json      # 가용 스키마
```

MCP 환경에서는 `h6s_catalog` 도구 하나로 동일 정보 — 4-call 묶음(`h6s_list_providers` + `h6s_list_schemas` + provider 별 credential-schema/actions) 를 라운드트립 1회로 줄여라. 개별 도구도 그대로 호출 가능하지만 capability discovery 가 목적이면 `h6s_catalog` 우선.

세부가 필요하면 개별 명령:

```bash
h6s providers list --output json    # 가용 금융기관
h6s schemas list --output json      # 가용 스키마(데이터 종류)
h6s credentials list                # 한국어 라벨 정리된 표 — 기관·인증수단·상태
```

## 3. 데이터 받기 — `h6s fetch` 한 줄

핵심 명령. provider + schema + 기간만 주면 credential 매칭/생성 안내 → 수집 요청 실행 → 폴링 → 결과 회수까지 자동.

```bash
# 패턴 A — 이미 credential 가 있을 때 (1개면 자동 매칭)
h6s fetch bank.transactions.cb.v1 --provider CB_KB --month 2026-03 --output markdown

# 패턴 B — 명시적 credential 지정
h6s fetch bank.transactions.cb.v1 --credential-id <uuid> --from 2026-03-01 --to 2026-03-31 --output csv --save ./out/

# 패턴 C — schema 의 추가 파라미터 전달
h6s fetch bank.transactions.cb.v1 --provider CB_KB --month 2026-03 --accountNumber 110-12-3456789 --output jsonl
```

| 옵션 | 비고 |
|---|---|
| `--provider <code>` | provider 별 credential 자동 매칭. 0건이면 `CREDENTIAL_INSUFFICIENT_FOR_PROVIDER` (exit 4). 2개 이상(GLOBAL CERT 다중 등록)이면 `CREDENTIAL_AMBIGUOUS` + 후보 list. |
| `--credential-id <uuid>` | 명시 지정. `--provider` 와 함께 사용 가능. |
| `--month YYYY-MM` | dateRangeStart/End 자동 계산 (해당 월 1일 ~ 말일). |
| `--from YYYY-MM-DD --to YYYY-MM-DD` | 명시 기간. |
| `--<schema-param> <value>` | schema 의 request 필드 추가 전달 (예: `--accountNumber 110-...`). |
| `--output <fmt>` | `json` (기본, 비-TTY) / `jsonl` / `csv` / `markdown` / `yaml` / `table`. |
| `--save <path>` | 파일 저장. 디렉토리만 주면 자동 파일명. `-` 면 stdout 강제. |
| `--no-wait` | 수집 요청 실행만 하고 즉시 반환 (기본은 폴링하며 결과까지 회수). |

## 4. credential 이 없을 때 — `--interactive` 로 한 줄 생성

`CREDENTIAL_INSUFFICIENT_FOR_PROVIDER` 가 나오면 자격증명을 등록한 뒤 다시 fetch 한다. 두 갈래:

> **카탈로그 읽는 법**: `h6s_catalog` 응답의 `globalCert` 가 공동인증서 입력 폼이고, 각 provider 의 `acceptsCertLogin` 이 그 기관이 인증서 로그인을 받는지를 표시한다. provider 별 `authMethods` 에 CERT 가 없어도 `acceptsCertLogin: true` 면 GLOBAL 공동인증서 1장으로 그 기관에 데이터 수집이 가능하다. 엔진 서비스정의서 기준 HOMETAX 와 모든 기업뱅킹은 CERT 가능, 법인카드는 기관별로 차이 있음 (삼성·하나는 ID 만).

- **공동인증서 (추천)** — PFX 1번 등록하면 `acceptsCertLogin: true` 인 모든 기관에 GLOBAL 로 공유. 한 번이면 끝.

  ```bash
  h6s credentials create --interactive --cert
  ```

- **특정 기관 ID·비밀번호** — provider 별로 따로.

  ```bash
  h6s credentials create --interactive --provider CB_KB
  ```

대화형 인자 없이 `h6s credentials create --interactive` 만 실행해도 첫 질문이 두 갈래 선택지로 시작한다.

스크립트에서 본문을 미리 작성해야 한다면 템플릿을 받아 채우는 모드:

```bash
h6s credentials create --explain --cert > credential.json              # 공동인증서 템플릿
h6s credentials create --explain --provider CB_KB > credential.json  # 기관 ID·비밀번호 템플릿
# credential.json 의 placeholder 를 실제 값으로 채우고 ↓
h6s credentials create --input @credential.json
```

MCP 환경에서는 `h6s_credentials_create` 도구로 동일 등록이 가능합니다. 도구 인자는 `h6s_catalog`의 `authMethods[].fields[].fieldKey`와 정확히 일치해야 하며, FILE 타입(PFX 등)은 호출자가 base64 인코딩 후 문자열로 전달합니다. PFX·비밀번호 같은 민감 값이 LLM context를 경유하므로 호출 전에 사용자 동의를 먼저 받습니다.

## 5. 결과 활용

`--output markdown` 으로 받으면 메타 헤더 + GFM 표가 그대로 보고서 자료로 사용 가능. CSV 는 pandas/엑셀, JSONL 은 jq/스트리밍.

엑셀에 인계해야 한다면 서버측 CSV — UTF-8 BOM + 한국어 컬럼 헤더 — 를 그대로 받습니다. `--output csv`의 클라이언트 직렬화(영문 key 헤더)와는 의미가 다릅니다.

```bash
# 완료된 수집 요청 → 한국어 헤더 CSV 파일
h6s data-jobs results <jobId> --csv --save ./out/

# 회계팀 인계용 — stdout 으로 받아 파이프
h6s data-jobs results <jobId> --csv > report.csv
```

월간 한도 추세를 확인하고 싶다면:

```bash
h6s me usage             # 이번 달 사용량 + 한도
h6s me usage-daily --days 30   # 최근 30일 일별 누적 (1~90 clamp)
```

같은 `(credential, schema, params)` 키로 24시간 안에 재실행하면 캐시 hit (stderr 에 `[cache hit]` 표시). 강제로 새로 받으려면 `--cache fresh`.

```bash
h6s cache list                           # 캐시 항목 보기
h6s cache prune --older-than 7d          # 오래된 항목 정리
```

## 6. 에러 처리 가이드

CLI 가 실패 시 "다음 단계" 한 줄을 stderr 에 같이 출력한다 — 그대로 따라 실행하면 대부분 해결된다.

| 상황 | exit | 대응 (CLI 가 안내하는 다음 단계) |
|---|---|---|
| `NO_API_KEY` | 3 | `h6s init` 또는 `h6s login` |
| `CREDENTIAL_INSUFFICIENT_FOR_PROVIDER` | 4 | `h6s credentials create --interactive --cert` (추천) 또는 `--provider <code>` |
| `CREDENTIAL_AMBIGUOUS` | 1 | 후보 list 보고 `--credential-id <uuid>` 명시 |
| `CREDENTIAL_PROBE_FAILED` | 1 | `h6s credentials list` 로 상태 확인 후 `--cert` 또는 `--provider <code>` 로 재등록 |
| `CERT_INVALID` / `CERT_EXPIRED` / `CERT_WRONG_PASSWORD` / `CERT_BIZNO_MISMATCH` | 1 | 갱신·재발급된 인증서로 `h6s credentials create --interactive --cert` 다시. BIZNO 는 워크스페이스 사업자번호와 일치해야 함 |
| `INVALID_DATA_JOB_PARAMS` | 1 | fieldErrors 로 누락 파라미터 확인 후 `--<key> <value>` 추가 |
| `DATE_RANGE_EXCEEDED` | 1 | schema 의 `maxRangeDays` 안에서 분할 |
| `MONTHLY_QUOTA_EXCEEDED` / `FREE_PLAN_*` | 1 | `h6s me usage` 로 잔여량 확인 |
| 5xx / 429 | 0 (자동 재시도 후 성공) 또는 1 | CLI/백엔드가 backoff. 그래도 실패면 사용자에게 보고 |
| AUTH (`LOGIN_FAILED` / `NO_VALID_CREDENTIAL`) | 1 | `h6s credentials create --interactive --cert` (추천) 또는 `--provider <code>` |

## 7. 비대화형 호출 컨벤션

스크립트/AI 호출 시 권장:

```bash
h6s --output json --quiet --no-color fetch <schema> --provider <code> --month 2026-03
```

- 응답 record 의 `schema` 필드가 polymorphic discriminator. 8개 variant: `bank.accounts.cb.v1`, `bank.transactions.cb.v1`, `hometax.tax-invoices.{sales,purchase}.v1`, `hometax.cash-receipts.{sales,purchase}.v1`, `card.cards.corp.v1`, `card.approvals.corp.v1`.
- 표준 권장 헤더는 schema 의 `response[]` 메타 (`displayName`) 에서 자동 생성 — 컬럼 매핑을 따로 지정하지 않아도 됨.

## 8. 보고서 작성 패턴

```bash
# 데이터 받기
h6s fetch bank.transactions.cb.v1 --provider CB_KB --month 2026-03 --output markdown --save /tmp/tx.md

# 받은 마크다운을 그대로 보고서에 인용 (메타 헤더 + 표)
cat /tmp/tx.md
```

여러 provider 를 비교하려면 같은 명령을 provider 만 바꿔 반복 후 결과를 합친다.

## 자세한 정보

- `h6s ai-guide` — 본 워크플로우의 최신 cheatsheet (CLI 가 직접 출력)
- `h6s --help` — 명령어 색인
- `<gateway>/llms.txt` — 백엔드가 노출하는 LLM 친화 마크다운 (raw API 사용 시 참고)
