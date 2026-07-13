# `@h6s-ai/toolkit` — headless AI Toolkit

AI 에이전트용 한국 금융 데이터 API를 Claude Code, Cursor, Gemini CLI, 일반 MCP 클라이언트에 한 줄로 연동하는 toolkit입니다. 은행·홈택스·카드 데이터를 받는 Claude Code plugin · Agent skill · MCP server 매니페스트가 한 패키지에 들어있습니다.

> **이 패키지가 필요한가요?** AI 에이전트가 자연어로 데이터를 조회·요약하게 만들 때 사용합니다. 자체 어드민·DB 적재·cron 자동화처럼 받은 데이터를 자기 시스템에 적재하는 경우에는 [REST API](https://h6s.ai/docs)가 더 적합합니다 — 예: [자체 정산 어드민에 매월 적재](https://h6s.ai/docs/showcase/settlement-admin-builder).

## 설치

### Claude Code (권장)

```
/plugin marketplace add bolta-io/h6s-toolkit
/plugin install h6s-data@h6s
```

설치 후 자연어("1월 국민은행 입출금내역") 또는 `/h6s-data:` 로 호출.

### 그 외 플랫폼

| 플랫폼 | 명령 | 위치 |
|---|---|---|
| Cursor | `npx @h6s-ai/toolkit install --target=cursor` | `~/.cursor/mcp.json` 의 `mcpServers.h6s` 병합 |
| Gemini CLI | `npx @h6s-ai/toolkit install --target=gemini` | `~/.gemini/extensions/h6s-data/` |
| 일반 MCP 클라이언트 | `npx @h6s-ai/toolkit install --target=mcp` | stdout 으로 스니펫만 출력 (사용자가 클라이언트 설정에 붙여넣음) |
| Claude Code (수동) | `npx @h6s-ai/toolkit install --target=claude-manual` | `~/.claude/plugins/h6s-data/` |

공통 옵션: `--dry-run` (변경 없이 미리보기), `--uninstall` (h6s 만 제거, 다른 server 는 보존)

## 첫 호출 지연 (cold-start)

`.mcp.json` 진입점이 `npx -y @h6s-ai/cli`라서 처음 한 번은 npm cache hydration으로 1~2분 걸립니다. MCP 클라이언트의 stdio handshake가 그 안에 끝나지 않으면 timeout처럼 보일 수 있습니다. `npm i -g @h6s-ai/cli`를 한 번 글로벌 설치해 두면 이후 호출 시간이 줄어듭니다 (`.mcp.json`의 `command`는 그대로 유효합니다).

## 지원

버그 리포트·기능 요청·기여: <https://h6s.ai> · <h6s@bolta.io>
