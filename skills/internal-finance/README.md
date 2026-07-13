# internal-finance — 팀 재무 자동화 카탈로그

> headless 워크스페이스를 가진 재무팀이 매월·매주 반복하는 작업을 한 묶음으로 자동화합니다.

## 무엇을 자동화하는가

반복적으로 도는 8개 시나리오:

| ID | 시나리오 | 메모 | 운영 주기 |
|---|---|---|---|
| A1 | daily-bank-summary | 다은행 통합 + 결손 탐지 | 매일 |
| A2 | reconcile-sales | 매출 정산 + 입금 매칭 | 월 1회 (월말) |
| A3 | dunning-tracker | 미수금 연체 분류 + 독촉 | 주 1회 |
| A4 | reconcile-purchase | 매입 정산 + 지출 정합 | 월 1회 (월초) |
| B1 | vat-precheck | 신고 전 자가 검증 | 분기 1회 |
| B2 | dept-expense-classifier | 부서별 비용 가시화 | 주 1회 |
| B3 | cash-receipt-gap-detector | 발행 누락 점검 | 월 1회 |
| C2 | weekly-backup-action | GitHub Actions 백업 | 주 1회 (cron) |
| V1 | solopreneur-income-tax | 1인 사장님 페르소나 (5월 종소세) | 매월 |
| V2 | ecommerce-pg-reconciliation | 이커머스 셀러 페르소나 (PG 정산) | 주 1회 |

C1 (카드 정합성) 은 준비되는 대로 합류합니다.

## 진입 방법

### Claude Code 안에서

자연어로:
> "이번 달 미수금 정리해줘"
> "어제 입출금내역 요약해서 Slack 에 보내줘"
> "이번 분기 부가세 신고 전 점검 좀"

또는 명시적으로 `/internal-finance` 호출 → 카탈로그 표를 보고 시나리오 선택.

### GitHub Actions cron 으로

`github-actions/weekly-backup.yml` 을 자기 백업 레포 `.github/workflows/` 에 복사 + `H6S_API_KEY` secret 등록.

## Stage 0 — 워크스페이스 부트스트랩 (1회)

처음 사용 시 [references/stage-0-bootstrap.md](references/stage-0-bootstrap.md) 를 따라 주세요. 요약:

1. headless 계정 + 팀 워크스페이스 생성 → API Key 발급 → 비밀 저장소(1Password 등)에 저장
2. CLI 프로필 설정: `h6s init` → API Key 입력
3. 자격증명 등록 (사람이 직접):
   - 사업자 공동인증서 1장 (`h6s credentials create --interactive --cert`) → 홈택스 + 기업뱅킹 동시 사용
   - 필요 시 은행 ID·PW 별도 등록
4. 헬스체크: `h6s fetch bank.accounts.cb.v1 --provider CB_KB` → 200 OK 확인
5. Slack/Notion 환경변수 등록 (`SLACK_WEBHOOK_URL`, `NOTION_TOKEN`, `NOTION_DB_RECONCILE_SALES` 등) → `references/conventions.md` § 환경변수 규약

## 환경변수 규약

[references/conventions.md](references/conventions.md) § 환경변수 규약 참조. 모든 시나리오가 이 규약을 따릅니다.

## 시나리오 추가 / 수정 절차

1. `references/scenario-<slug>.md` 작성 (다른 시나리오 파일을 템플릿으로)
2. `SKILL.md` § 1 시나리오 분기 표에 한 행 추가
3. README 표에 한 행 추가
4. `pnpm --filter @h6s-ai/toolkit lint` 통과 확인
5. 사용자 노출 텍스트(키워드, Slack 메시지 포맷, Notion 컬럼명) 가 새 도메인 용어를 도입하면 `.claude/skills/consistency-review/references/glossary.md` 갱신을 같은 PR 에 포함

## 비밀값 외부화 원칙

시나리오 본문에 팀 전용 값(계정과목 룰북 세부 사항, 거래처 명단, 부서명, 슬랙 채널명 등)을 직접 적지 않고 환경변수 또는 자기 비밀 저장소에서 로드합니다. 외부 사용자도 자기 워크스페이스에서 시나리오를 그대로 응용할 수 있어야 합니다.
