# Cold-start 지연 처리

`.mcp.json` 진입점이 `npx -y @h6s-ai/cli mcp` 라서 첫 호출은 1~2분 걸린다. 두 번째부터는 캐시가 있어 즉시. MCP 클라이언트마다 stdio handshake timeout 이 짧아 첫 호출이 실패한 것처럼 보일 수 있다.

## 회피 — 사전 글로벌 설치 (권장)

```bash
npm i -g @h6s-ai/cli
```

`.mcp.json` 의 `command: "npx"` 는 그대로 두어도 PATH 의 글로벌 바이너리를 우선 사용 → 첫 호출 즉시 시작.

## 클라이언트별 첫 호출 동작

| 클라이언트 | 첫 호출 동작 | 권장 |
|---|---|---|
| Claude Desktop | 5~10초 안에 응답이 안 오면 "이 서버는 응답하지 않습니다" 표시 | 글로벌 사전 설치 또는 "재시도" 한 번 |
| Cursor | 시작 시 백그라운드에서 spawn — 첫 호출이 빠른 편 | 글로벌 설치 없이도 동작하나, 설치 권장 |
| Claude Code | plugin 설치 시 cache 가 한 번 hydration → 이후 즉시 | 별도 조치 불필요 |
| 일반 MCP 클라이언트 | 클라이언트에 따라 다름 — `npx` 가 stdout 으로 install log 를 흘릴 경우 stdio 파이프 오염 위험 | 글로벌 설치 강력 권장 |

## 사용자에게 한 줄 안내

첫 호출에서 응답이 늦으면 클라이언트가 자동으로 "응답 없음" 을 보일 수 있다. 다음 한 줄을 응답 가능 시 회신:

```text
첫 호출은 npm cache hydration 으로 1~2분 걸립니다.
다음 호출부터 즉시 시작합니다 — 미리 `npm i -g @h6s-ai/cli` 한 번 추천합니다.
```

## 검증

```bash
# CLI 가 글로벌 PATH 에 있는지
which h6s

# MCP 서버 직접 stdio 확인 (Ctrl+C 로 종료)
h6s mcp
```

`h6s mcp` 가 stdout 으로 JSON-RPC 핸드셰이크를 출력하면 서버 자체는 정상.
