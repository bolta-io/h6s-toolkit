# github-action — GitHub Actions × headless 수집 카탈로그

> `bolta-io/h6s-action@v2` 로 한국 금융 데이터 수집을 cron으로 자동화하는 6가지 패턴.
> plain-text accounting 사용자, 비영리·임의단체 회계담당, SMB 운영자를 1차 청중으로 삼습니다.

## 무엇을 자동화하는가

`packages/h6s-action/examples/` 의 cookbook 6개를 Claude Code가 키워드로 자동 선택하도록 메타데이터 카탈로그화한 묶음:

| ID | 시나리오 | 운영 주기 | 출력 |
|---|---|---|---|
| P1 | monthly-bank-pr | 매월 1일 | PR |
| P2 | weekly-multi-schema | 매주 월 | PR (합본) |
| P3 | notify-on-fetch | 매주 / 매월 | Slack |
| P4 | upload-artifact | 매월 1일 | Artifact (90일) |
| P5 | ai-ledger | 매주 월 | PR (전표 추가) |
| P6 | multi-provider | 매주 월 | Artifact (provider 별) |

## 진입 방법

### Claude Code 안에서

자연어:
> "전월 입출금내역을 매월 1일 자동으로 PR 로 받고 싶어"
> "매주 은행 + 세금계산서 한 번에 받아서 한 PR 로 합쳐줘"
> "수집 끝나면 Slack 으로 한 줄 알림"

또는 명시적으로 `/github-action` 호출 → 시나리오 표를 보고 골라 yml 복사.

### 직접 복붙

repo의 `.github/workflows/<name>.yml` 로 [packages/h6s-action/examples/](../../../h6s-action/examples/) 의 파일을 복사하고 secrets `H6S_API_KEY` 만 등록.

## 진실 원천

워크플로우 yml 본체는 [`packages/h6s-action/examples/`](../../../h6s-action/examples/) 가 단일 진실 원천입니다. 이 skill 안의 `references/scenario-*.md` 는 yml 사본을 두지 않고 메타데이터(의도, 키워드, 입력/출력, 핵심 step 발췌, 응용 팁)만 다룹니다 — 사본과 원본이 어긋나는 drift를 막기 위한 설계입니다.

## 환경 / Secrets

| Secret | 필수 | 용도 |
|---|---|---|
| `H6S_API_KEY` | ✓ | headless Open API key. 콘솔에서 발급 |
| `SLACK_BOT_TOKEN` | (P3) | Slack 알림 시 |
| `ANTHROPIC_API_KEY` | (P5) | Claude Code Action ledger 자동 작성 시 |

## 시나리오 추가 / 수정 절차

1. `packages/h6s-action/examples/<slug>.yml` 작성 또는 수정 (yml 본체는 항상 examples/ 가 먼저)
2. `packages/ai-toolkit/skills/github-action/references/scenario-<slug>.md` 작성 — 다른 scenario 파일을 템플릿으로
3. `SKILL.md` § 1 시나리오 분기 표에 한 행 추가
4. 이 README 표에 한 행 추가
5. `pnpm --filter @h6s-ai/toolkit lint` 통과 확인
6. 사용자 노출 텍스트가 새 도메인 용어를 도입하면 `.claude/skills/consistency-review/references/glossary.md` 갱신을 같은 PR 에 포함

## 외부 노출 주의

이 skill은 `@h6s-ai/toolkit` npm 패키지에 함께 publish됩니다. references 의 모든 시나리오는 외부 사용자가 자기 워크스페이스·자기 secret으로 그대로 가져갈 수 있는 형태로 작성되어 있습니다. 팀 전용 값(워크스페이스 이름, 거래처·부서·계좌번호, 슬랙 채널명)은 references 본문에 직접 적지 않고 환경변수·secret으로 외부화합니다.
