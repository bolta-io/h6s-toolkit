# Stage 0 — 워크스페이스 부트스트랩

처음 internal-finance 묶음을 쓸 때 1회 수행. 자격증명 등록은 사람이 직접 한다 (Claude 가 인증서·비밀번호에 손대지 않는다).

## 1. headless 워크스페이스 생성

콘솔(`https://console.h6s.ai`)에서:

1. 팀 공용 이메일(예: `<finance-team>@<your-domain>`) 로 가입 — 개인 계정 금지
2. 워크스페이스 이름은 팀이 합의한 표기로 (예: `<team>-finance`)
3. API Key 발급 (`Console → API Keys → Create`)
4. 발급된 `h6s_live_...` 키를 팀 비밀 저장소(1Password vault, AWS Secrets Manager 등)에 저장
5. (선택) 팀 슬랙 채널에 키 회전 일정을 등록

## 2. CLI 프로필 설정

운영자 단말에서:

```bash
npm i -g @h6s-ai/cli
h6s init
# 프로필명: <팀이 합의한 워크스페이스 이름>
# API Key: 비밀 저장소에서 복사한 h6s_live_...
```

`h6s me` → `workspace: <팀 워크스페이스>` 확인.

## 3. 자격증명 등록

### 3-1. 사업자 공동인증서 (필수, 1장)

`h6s_catalog` 응답의 `globalCert` 항목을 그대로 따라 PFX 1장 등록. 홈택스 + `acceptsCertLogin: true` 인 모든 기업뱅킹에 GLOBAL 로 공유된다.

```bash
h6s credentials create --interactive --cert
```

대화형 입력:
- PFX 파일 경로 (비밀 저장소에서 다운로드)
- 인증서 비밀번호
- 사업자등록번호 (워크스페이스 BIZNO 와 일치해야 함 — `CERT_BIZNO_MISMATCH` 회피)

### 3-2. 은행 ID·비밀번호 (선택)

공동인증서로 커버되지 않는 기관이 있을 때만. 예: 일부 카드사·인터넷전문은행.

```bash
h6s credentials create --interactive --provider CB_KB
```

provider 코드는 `h6s providers list` 로 조회.

### 3-3. 등록 확인

```bash
h6s credentials list
# 표에 등록된 자격증명 + 상태(HEALTHY / UNKNOWN / FAILED) 확인
```

## 4. 헬스체크 (각 자격증명마다 1회)

작은 범위 data-job 1회 성공으로 자격증명 유효성 확인. CLI 는 `failureCategory == CREDENTIAL` 인지로 판정한다 (`docs/scraping-api/credential-verification.md` 패턴).

```bash
# 은행 — 계좌 목록 (가장 가벼움)
h6s fetch bank.accounts.cb.v1 --provider CB_KB --output table

# 홈택스 — 어제 1일 매출 세금계산서
h6s fetch hometax.tax-invoices.sales.v1 --from $(date -v-1d +%F) --to $(date -v-1d +%F) --output table
```

성공하면 200 OK + 데이터 출력. 실패 시 CLI stderr 의 다음 단계 메시지를 그대로 따른다.

## 5. 출력 채널 환경변수

skill 들이 결과를 보낼 채널. 시스템 환경변수 또는 운영자 단말의 `.env` 에 등록.

| 변수 | 용도 | 발급처 |
|---|---|---|
| `SLACK_WEBHOOK_URL` | 일일 거래 요약, 미수금 알림 | 팀 재무 슬랙 채널 Webhook |
| `SLACK_WEBHOOK_URL_DUNNING` | 미수금 DM 전용 (선택) | Slack DM 채널 |
| `NOTION_TOKEN` | Notion API integration 토큰 | Notion → Settings → Integrations → New |
| `NOTION_DB_RECONCILE_SALES` | 미매칭 매출 DB ID | Notion DB share URL |
| `NOTION_DB_DUNNING` | 미수금 트래커 DB ID | Notion DB share URL |
| `NOTION_DB_RECONCILE_PURCHASE` | 미매칭 매입/무계산서 지출 DB ID | Notion DB share URL |

Slack/Notion 토큰은 팀 비밀 저장소에 함께 보관. GitHub Actions 에서 쓰려면 동일 변수명으로 repository secret 에 등록.

## 6. 운영 단말 vs GitHub Actions

| 시나리오 | 권장 실행 위치 |
|---|---|
| daily-bank-summary, reconcile-sales, dunning-tracker, reconcile-purchase | 운영자 단말의 Claude Code 안에서 자연어 호출 (사람이 결과 검토) |
| weekly-backup-action | GitHub Actions cron (무인) |
| vat-precheck, dept-expense-classifier, cash-receipt-gap-detector | 분기·주·월 시즌 도래 시 운영자 단말 |

자동화의 정도는 시나리오별로 README § 운영 주기 표 참조.

## 7. 부트스트랩 완료 체크리스트

- [ ] 워크스페이스 생성 + API Key 비밀 저장소에 저장
- [ ] CLI 프로필 설정 완료
- [ ] 공동인증서 1장 등록 + `h6s credentials list` 에 HEALTHY
- [ ] (필요 시) 은행 ID·비밀번호 등록
- [ ] 헬스체크 — 은행 계좌 목록 1회 + 홈택스 어제 매출 1회 모두 200 OK
- [ ] Slack/Notion 환경변수 등록 + 빈 메시지로 채널 1회 테스트
- [ ] (선택) GitHub Actions secrets 등록

체크리스트가 모두 완료되면 [SKILL.md](../SKILL.md) § 1 시나리오 분기 로 진입 가능.
