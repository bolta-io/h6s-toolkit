# mcp-finance — MCP × headless 자연어 조회 카탈로그

> Claude Desktop · Cursor · Claude Code 의 MCP 클라이언트에서 한국 금융 데이터를 **자연어 한 줄**로 받는 시나리오 묶음.

## 무엇을 자동화하는가

`@h6s-ai/cli mcp` 가 노출하는 tool 위에서, 세 가지 페르소나의 반복 질의를 자연어 → tool 호출로 매핑합니다.

| ID | 시나리오 | 대상 사용자 | 호출 빈도 |
|---|---|---|---|
| M1 | solopreneur-vat-quarterly | 1인 사장님 / 소상공인 | 분기 1회 (신고 직전) |
| M2 | accounting-firm-client-query | 회계법인 / 세무사무소 | 임의 (수시) |
| M3 | saas-cash-cycle | SaaS 스타트업 CFO | 주 1회 / 월 1회 |

`h6s-data` (CLI 단발), `internal-finance` (팀 재무 후처리), `github-action` (무인 cron) 세 skill의 **MCP 채널 변종**. 데이터는 같고, 사용 경험만 자연어 채팅으로 바뀝니다.

## 진입 방법

### Claude Code (권장)

```
/plugin marketplace add bolta-io/h6s-toolkit
/plugin install h6s-data@h6s
```

설치 후 자연어("2026-Q1 부가세 자료 모아줘") 또는 `/h6s-data:` 호출.

### Claude Desktop · Cursor · 일반 MCP 클라이언트

```bash
npx @h6s-ai/toolkit install --target=cursor    # ~/.cursor/mcp.json
npx @h6s-ai/toolkit install --target=mcp       # 스니펫만 stdout — 직접 붙여넣기
```

Claude Desktop의 경우 `--target=mcp` 출력을 `~/Library/Application Support/Claude/claude_desktop_config.json` 의 `mcpServers` 키에 병합.

## 첫 호출 지연 (cold-start)

`.mcp.json` 진입점이 `npx -y @h6s-ai/cli mcp` 라서 첫 호출은 1~2분 걸립니다. 미리 `npm i -g @h6s-ai/cli` 로 설치해 두면 바로 시작됩니다. 자세한 패턴은 [references/cold-start.md](references/cold-start.md).

## 진입 체크 (1회)

1. 콘솔(<https://h6s.ai>) 에서 API Key 발급
2. MCP 설정의 `H6S_API_KEY` 환경변수에 등록
3. 자격증명을 콘솔 또는 `h6s credentials create --interactive` 로 미리 등록 — **MCP는 자격증명 등록을 다루지 않습니다**
4. 첫 자연어 호출 → MCP 클라이언트가 `h6s_catalog` 를 자동 호출해 capability 표시

## 시나리오 추가 / 수정 절차

1. `references/scenario-<slug>.md` 작성 (다른 시나리오 파일을 템플릿으로)
2. `SKILL.md` § 1 시나리오 분기 표에 한 행 추가
3. README 표에 한 행 추가
4. `.changeset/<slug>.md` 추가 — `@h6s-ai/toolkit: minor`
5. 새 도메인 용어를 도입했다면 `.claude/skills/consistency-review/references/glossary.md` 같은 PR 에 갱신

## 외부 노출 주의

이 묶음은 `@h6s-ai/toolkit` npm 패키지에 함께 publish됩니다. 시나리오 본문에 팀 전용 값(거래처 명단, 부서명, 슬랙 채널명 등) 을 직접 적지 않고 환경변수 또는 사용자 워크스페이스 단위로 분리합니다.
