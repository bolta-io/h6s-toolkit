---
name: mcp-finance
description: headless 의 MCP 서버(`@h6s-ai/cli mcp`) 위에서 한국 금융 데이터(은행·홈택스)를 자연어로 조회하는 시나리오 카탈로그. Claude Desktop · Cursor · Claude Code 의 MCP 클라이언트가 `h6s_fetch_data` 등 MCP tool 을 호출해 데이터를 받고 사용자에게 자연어로 요약한다. 사용자가 "MCP 로 입출금내역 알려줘", "Claude Desktop 에서 부가세 자료", "분기 매출 합계", "이번주 클라이언트 거래", "캐시 사이클 요약" 같은 자연어로 조회 요청을 할 때 자동 적용. 3 시나리오: 1인사장님 분기 부가세 / 회계법인 클라이언트 자연어 조회 / SaaS 캐시 사이클 요약.
---

# MCP × headless 자연어 조회 카탈로그

`@h6s-ai/cli` 의 `mcp` 명령이 노출하는 tool (`h6s_catalog / h6s_list_providers / h6s_list_schemas / h6s_get_schema / h6s_list_credentials / h6s_fetch_data / h6s_fetch_data_start / h6s_fetch_data_status / h6s_fetch_data_results / h6s_report_bug` 등) 을 자연어로 묶어 쓰는 패턴 모음. CLI(`h6s fetch`) 가 단발 명령, 이 skill 은 MCP 클라이언트 안에서 같은 데이터를 자연어 한 줄로 받는 경험을 다룬다.

각 시나리오는 (a) 사용자 자연어 → (b) tool 호출 1~3개 → (c) 응답 요약 → (d) 후속 제안 의 4단계로 정형화된다. tool 호출 자체는 클라이언트(Claude Desktop 등) 가 처리하므로, 이 카탈로그는 **자연어 ↔ tool 호출 매핑 규약** 과 **응답 요약 포맷** 에 집중한다.

## 0. 진입 체크

MCP 서버가 등록되어 있어야 한다. 등록 여부와 cold-start 처리는 [references/cold-start.md](references/cold-start.md) 참조.

```text
사용자: "MCP 입출금내역 알려줘"
↓
1. MCP 등록 확인 (클라이언트 설정 파일에 h6s 서버 한 줄)
2. h6s_catalog 호출 → 워크스페이스 capability 표 확인 (provider 목록, 자격증명 수)
3. 자격증명 0개면 → "콘솔에서 자격증명 등록 후 다시" 안내 (자격증명 등록은 MCP 로 못 함)
```

자격증명 등록은 MCP 가 다루지 않는다 — `@h6s-ai/cli` 의 `h6s credentials create --interactive` 또는 콘솔 UI 만 가능.

## 1. 시나리오 분기

| 키워드 / 자연어 | 시나리오 | 핵심 tool | 상세 |
|---|---|---|---|
| "분기 부가세 자료", "신고용 합계", "VAT 신고 모아줘" | **solopreneur-vat-quarterly** (M1) | `h6s_fetch_data` × 4 (매출/매입 세금계산서 + 매출/매입 현금영수증) | [references/scenario-solopreneur-vat-quarterly.md](references/scenario-solopreneur-vat-quarterly.md) |
| "클라이언트 X 이번주 거래", "○○ 워크스페이스 입출금" | **accounting-firm-client-query** (M2) | `h6s_catalog` + `h6s_fetch_data` × 1~N | [references/scenario-accounting-firm-client-query.md](references/scenario-accounting-firm-client-query.md) |
| "이번달 캐시 사이클", "MRR 대비 출금", "runway 알려줘" | **saas-cash-cycle** (M3) | `h6s_fetch_data` × 1~2 (은행 입출금) | [references/scenario-saas-cash-cycle.md](references/scenario-saas-cash-cycle.md) |

여러 시나리오가 한 자연어에 섞이면(예: "이번달 매출이랑 runway 둘 다") 시나리오를 분리 호출하지 말고 같은 응답에 묶어 정리한다 — tool 호출 횟수는 데이터 단위로 줄인다.

## 2. 공통 룰북

- [references/conventions.md](references/conventions.md) — 자연어 → tool 호출 매핑 규약, 기간 해석(`이번주`/`지난달`/`Q1`), provider 추론, 응답 요약 포맷, "사용자에게 묻기 전 추론" 우선순위
- [references/cold-start.md](references/cold-start.md) — `npx -y @h6s-ai/cli mcp` 의 첫 호출 지연 처리, 사전 글로벌 설치 권장

## 3. 응답 포맷

사용자에게 보여주는 응답은 **세 줄**을 기본으로 한다 — 클라이언트 UI 가 채팅 한 두 줄에 최적화돼 있어, 표나 긴 JSON 은 fold 된다.

```text
✓ <한 줄 요약 — 결과 핵심 수치>
<핵심 분해 1줄 — 예: 입금 + / 출금 - 합계>
<후속 제안 1줄 — 다음 자연어 한 줄 또는 콘솔 링크>
```

전체 row 가 필요하면 사용자가 "표로 보여줘", "CSV 로 저장" 같은 후속 요청을 할 때만 풀어서 응답.

## 4. tool 호출 횟수

자연어 한 번에 tool 호출이 4번을 넘으면 `h6s_report_bug` 의심 신호 — 시나리오 분기를 잘못 잡았을 가능성. 대표 패턴:

| 시나리오 | 정상 호출 수 |
|---|---|
| M1 (분기 부가세) | 4회 (4종 schema 병렬) |
| M2 (클라이언트 조회) | 2~3회 (catalog 1 + fetch 1~2) |
| M3 (캐시 사이클) | 1~2회 |

5번 이상이면 같은 schema 를 중복 호출하거나, `h6s_list_*` 를 매번 새로 부르는 패턴. 캐시는 클라이언트 세션 안에서만 유효하므로 같은 자연어 안에서는 메타 호출(`h6s_catalog`, `h6s_list_schemas`) 을 1회로 줄인다.

## 5. 에러 처리

| 응답 코드 | 사용자에게 보여주는 한 줄 | 다음 액션 |
|---|---|---|
| `NO_API_KEY` | "API Key 가 등록 안 됨. 콘솔(https://h6s.ai) 에서 발급 후 MCP 설정에 추가" | 콘솔 안내 + 설정 위치 가이드 |
| `CREDENTIAL_INSUFFICIENT_FOR_PROVIDER` | "○○ 은행 자격증명이 없거나 사용 불가. `h6s credentials create` 로 등록 후 재시도" | CLI 명령 안내 (MCP 가 직접 등록 불가) |
| `DATE_RANGE_EXCEEDED` | "기간이 schema 최대치 초과 — 월 단위로 쪼개서 다시" | 자동 분할 후 재호출 |
| `MONTHLY_QUOTA_EXCEEDED` | "이번달 호출 한도 소진. 콘솔에서 한도 확인 / 다음달 1일 자동 리셋" | 콘솔 링크 |
| 그 외 | 응답 errorCode 그대로 + "운영 채널에 자동 제보됐다 (`h6s_report_bug`)" | bug 자동 호출 |

자동 제보(`h6s_report_bug`) 트리거는 [references/conventions.md](references/conventions.md) § 자동 제보 룰 참조.

## 6. 비대화형 호출

MCP 채널 자체가 대화형이라 비대화형 호출은 의도하지 않는다. 무인 cron 자동화가 필요하면 `github-action` skill 의 시나리오를 권장.

## 자세한 정보

- [README.md](README.md) — 묶음 개요 + 설치 방법 + 시나리오 추가 절차
- [references/](references/) — 시나리오 + 공통 룰북
- `h6s-data` skill — CLI 단발 호출 (이 skill 의 채널 변종)
- `internal-finance` skill — CLI + Claude Code 후처리 (팀 재무 시나리오)
- `github-action` skill — 무인 cron 자동화
