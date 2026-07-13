# Conventions — github-action skill 공통 룰북

모든 시나리오가 공유하는 규약. 시나리오 작성 / 검토 / 트러블슈팅 전에 한 번 읽어둔다.

## Secrets / 환경변수

| 키 | 종류 | 누가 채우나 | 비고 |
|---|---|---|---|
| `H6S_API_KEY` | repo secret | 콘솔에서 발급 | 모든 시나리오 필수. `${{ secrets.H6S_API_KEY }}` 를 액션의 `api-key:` 에 전달 |
| `SLACK_BOT_TOKEN` | repo secret | Slack 알림 시 | P3 `notify-on-fetch` |
| `ANTHROPIC_API_KEY` | repo secret | Claude Code Action 호출 시 | P5 `ai-ledger` |
| `vars.SLACK_CHANNEL_ID` | repo variable | Slack 채널 ID | secret 아님 (채널 ID 는 노출돼도 됨) |

repo secret 등록: `Settings → Secrets and variables → Actions → New repository secret`.

## Permissions

호출자 workflow 의 최소 `permissions:` 매트릭스:

| 후속 step | contents | pull-requests | issues | actions |
|---|---|---|---|---|
| PR 생성 (P1/P2/P5) | write | write | — | — |
| Artifact 만 (P4/P6) | read (기본값) | — | — | — |
| Slack 알림만 (P3) | read (기본값) | — | — | — |
| `git commit && push` 직접 | write | — | — | — |

GitHub 의 기본 `GITHUB_TOKEN` 은 repo 의 `Settings → Actions → General → Workflow permissions` 가 "Read repository contents and packages permissions" 로 잠겨 있으면 yml 의 `permissions:` 를 명시해도 PR 생성이 거부된다 — repo 설정에서 "Allow GitHub Actions to create and approve pull requests" 도 함께 켜야 한다.

## Cron 시간대

GitHub Actions cron 은 UTC 기준. 한국시간(KST = UTC+9) 환산표:

| 의도 | KST | UTC | cron |
|---|---|---|---|
| 매월 1일 KST 09:00 (전월 마감) | 매월 1일 09:00 | 매월 1일 00:00 | `0 0 1 * *` |
| 매주 월요일 KST 09:00 | 매주 월 09:00 | 매주 월 00:00 | `0 0 * * 1` |
| 매일 KST 09:00 | 매일 09:00 | 매일 00:00 | `0 0 * * *` |
| 매일 KST 자정 (전일 마감) | 매일 00:00 | 전일 15:00 | `0 15 * * *` |
| 매주 금요일 KST 18:00 (주간 마감) | 매주 금 18:00 | 매주 금 09:00 | `0 9 * * 5` |

날짜 산출은 yml step 에서 `date -u -d` 로 (runner 는 항상 UTC). 예: 전월 = `$(date -u -d '1 month ago' +%Y-%m)`, 7일 전 = `$(date -u -d '7 days ago' +%F)`. 월요일 cron 에서 GNU `date` 의 `last monday` 는 이미 7일 전을 가리키므로 `-7 days` 를 추가로 더하지 말 것 (14일 전이 됨).

GitHub 의 cron 은 **공식적으로 정확한 발동을 보장하지 않는다** — 글로벌 부하에 따라 수 분~수 시간 지연될 수 있다. 지연이 운영상 문제면 cron 만 의존하지 말고 `workflow_dispatch:` 도 함께 열어두고 외부 cron(EventBridge / Cloud Scheduler 등) 에서 GitHub API 로 트리거하는 패턴을 고려.

## Output-path 명명

데이터 디스크 출력 경로는 시나리오 간 충돌 없이 한 repo 에 누적되도록 다음 규약을 따른다:

```
data/<domain>/<resource>/<YYYY-MM-DD-or-YYYY-MM>-<provider>.csv
```

- domain: `bank` / `hometax`
- resource: `transactions` / `tax-invoices-sales` / `tax-invoices-purchase` / `cash-receipts-sales` / `cash-receipts-purchase` / `accounts`
- 기간 표기: 월간 시나리오는 `YYYY-MM`, 주간/일간은 `YYYY-MM-DD` (수집 시점 = end date)
- provider 는 항상 끝에 — 같은 기간 다른 기관을 정렬해서 보기 좋다

예:
- `data/bank/transactions/2026-04-CB_IBK.csv`
- `data/hometax/tax-invoices-sales/2026-04-30-HOMETAX.csv`

P5(ai-ledger) 만 예외 — Claude Code Action 이 ledger 디렉터리 구조를 따로 잡으므로 수집 결과는 `./incoming/bank/` 등 임시 위치에 두고 처리 후 비운다.

## 버전 핀

`uses: bolta-io/h6s-action@<ref>` 의 ref 정책:

| 핀 | 의도 | 권장 사용처 |
|---|---|---|
| `@v2` | rolling 메이저 태그 — 2.x 시리즈 안에서 자동 최신화 | 대부분의 시나리오. CLI 와 action 이 fixed group 으로 함께 동기화 |
| `@v2.5.4` | 정확 버전 핀 | 운영 안정성 우선이거나 `@v2` 가 일시적으로 안 풀릴 때 |
| `@main` | 비권장 — 미공개 변경 들어옴 | 액션 개발자 내부 디버깅용 |

메이저 버전이 올라가면 새 rolling 태그가 함께 생성되고 README 도 같은 릴리즈에서 갱신된다.

`cli-version` 입력은 보통 비워둔다 — 액션 버전과 CLI 버전이 fixed group 으로 동기화되어 있어 자동으로 정합 버전이 잡힌다. 특정 CLI 버전을 핀 해야 할 때만 명시.

## 단말 리허설 (Stage 1 검증)

워크플로우를 commit 하기 전에 운영자 단말에서 같은 흐름을 한 번 돌려본다 — 이게 가장 빠른 디버깅이다:

```bash
export H6S_API_KEY=<repo secret 과 동일한 값>

# yml 의 fetch step 과 동등
h6s fetch bank.transactions.cb.v1 \
  --provider CB_IBK \
  --month 2026-04 \
  --output csv \
  --save ./out/

ls ./out/                           # 파일 모양 확인
```

여기서 200 OK 면 yml 도 200 OK. credential 매칭이 안 되거나 schema 인자가 부족하면 같은 에러가 단말과 yml 양쪽에 동일하게 뜬다.

## 진실 원천

- yml 본문: [`packages/h6s-action/examples/`](../../../h6s-action/examples/) — 새 변형이나 수정은 여기를 먼저 손댄다
- 액션 인터페이스(inputs/outputs): [`packages/h6s-action/action.yml`](../../../h6s-action/action.yml) + README
- 이 skill 의 `scenario-*.md`: 메타데이터(의도·키워드·요약)만. yml 사본 보관 금지 — drift 방지
