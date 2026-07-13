# Troubleshooting — github-action skill

워크플로우가 빨갛게 죽었을 때 보는 표. 액션 본체(`packages/h6s-action/scripts/run.sh`) 가 내뱉는 `::error::` 메시지 또는 CLI 가 돌려주는 `BusinessErrorCodeBook` 키를 기준으로 1차 진단한다.

## 증상별 대응

| 증상 / 메시지 | 1차 진단 | 대응 |
|---|---|---|
| `H6S_API_KEY 가 설정되지 않았습니다` | secret 미등록 또는 액션에 전달 안 됨 | repo secret `H6S_API_KEY` 등록 + 액션 step 의 `with: api-key: ${{ secrets.H6S_API_KEY }}` 확인 |
| `provider 입력이 비어 있습니다` | `with: provider:` 누락 | 액션 step 에 `provider:` 추가. matrix 시 `${{ matrix.provider }}` 가 빈 문자열로 풀리는지 확인 |
| `job 제출 응답에서 id 를 찾지 못했습니다` | fetch 단계가 200 OK 가 아님 (대부분 credential / 인자 문제) | `::group::data-job 제출` 로그를 펼쳐 CLI 출력 확인. `CREDENTIAL_INSUFFICIENT_FOR_PROVIDER` / `CREDENTIAL_AMBIGUOUS` / 인자 누락 메시지가 뜸 |
| `CREDENTIAL_INSUFFICIENT_FOR_PROVIDER` | 워크스페이스에 해당 provider 매칭 credential 0건 | 운영자 단말에서 `h6s credentials create --interactive --cert` (공동인증서, 권장) 또는 `--interactive` (ID/PW) |
| `CREDENTIAL_AMBIGUOUS` | 같은 provider 에 매칭되는 credential 이 2개 이상 | 운영자 단말에서 `h6s credentials list --output json` 으로 후보 확인 후 중복 정리. 또는 액션의 향후 `credential-id` 입력을 기다리거나, CLI 가 받는 `H6S_CREDENTIAL_ID` env 를 workflow `env:` 에 직접 박는 임시 회피 |
| `CERT_EXPIRED` | 공동인증서 만료 | 운영자 단말에서 새 PFX 발급 후 `h6s credentials create --interactive --cert` 재등록 |
| `data-job 실패 (kind=Failed, error=…)` | 엔진 단계 실패 (인증/네트워크/페이지 변경) | 메시지의 `error=` 코드 + 콘솔의 jobs 페이지에서 `failureCategory` 확인. `failureCategory == CREDENTIAL` 이면 자격증명 갱신, `EXTERNAL` 이면 엔진/외부 서비스 일시 장애라 재실행 |
| `잡 폴링 타임아웃 (…s)` | timeout 안에 못 끝남 (CLI 폴링 한도 초과로 중단) | 액션 `timeout:` 을 `60m` 으로 늘리거나 기간을 쪼개 호출 (예: 한 달 → 두 주씩 두 번) |
| `MONTHLY_QUOTA_EXCEEDED` | 월 API 호출 한도 초과 | 콘솔에서 플랜 업그레이드 또는 다음 달까지 대기. 같은 데이터 반복 요청이면 P4 Artifact 보존 패턴으로 재실행 줄이기 |
| `DATE_RANGE_EXCEEDED` | provider 별 최대 조회 기간 초과 | provider 가 한 번에 받을 수 있는 범위(예: 일부 은행 90일) 안으로 쪼개 호출. matrix 로 분할 |
| cron 이 정해진 시간에 안 돌음 | (1) 60일 이상 repo 활동 없음 (2) 기본 브랜치가 아닌 곳에 yml (3) GitHub 글로벌 지연 | (1) 어떤 식으로든 commit 1개 누적 (2) yml 을 default branch 로 옮기기 (3) GitHub status 페이지 확인. 운영 critical 하면 `workflow_dispatch` 도 함께 열어두고 외부 cron 으로 트리거 |
| `actions/upload-artifact` 에서 `No files were found` | `outputs.path` 가 디렉터리인데 wildcard 안 붙임 | `path: ${{ steps.fetch.outputs.path }}` 로 (액션이 항상 단일 파일 경로 반환) 또는 디렉터리를 묶고 싶으면 `path: ${{ steps.fetch.outputs.path }}/..` 같은 방식은 피하고 `path:` 에 `data/bank/**` 같은 글롭 사용 |
| `uses: bolta-io/h6s-action@v2` 가 resolve 안 됨 | (1) mirror push 가 아직 안 됐음 (2) repo private | (1) `release.yml` 의 mirror step 이 main 머지 후 1 사이클 안에 돌아야 함. 콘솔에서 토킷 publish 사이클 확인 (2) `bolta-io/h6s-action` repo 가 public 인지 확인. 임시로 `@v2.5.4` 정확 버전 핀으로 우회 |
| PR 생성에서 `GitHub Actions is not permitted to create or approve pull requests` | repo 설정에서 PR 생성 차단 | `Settings → Actions → General → Workflow permissions` 에서 "Allow GitHub Actions to create and approve pull requests" 체크 |

## 디버깅 절차

1. **단말 리허설 먼저** — `references/conventions.md` § 단말 리허설 의 명령을 운영자 단말에서 같은 인자로 한 번 돌려본다. 여기서 통과하면 yml 도 통과한다. 여기서 막히면 90% 가 credential / 인자 문제
2. **로그 펼치기** — Actions 페이지에서 `::group::` 블록을 펼쳐 CLI 의 실제 출력 확인. action.yml 의 step 출력은 묶여 있어서 펼쳐야 보임
3. **JOB_ID 로 콘솔 조회** — Actions 로그에 `Job ID: <uuid>` 가 찍힘. 콘솔의 jobs 페이지에서 같은 UUID 로 들어가 `failureCategory` / `requestPayload` / `responsePayload` 까지 확인
4. **재실행은 `workflow_dispatch`** — 같은 yml 을 그대로 한 번 더 돌려보고 일시 장애인지 확인. provider/기간 조정이 필요하면 `inputs:` 로 받도록 yml 잠깐 수정해서 재실행

## 자주 묻는 함정

- **`@v6` 가 안 찾아짐 (`peter-evans/create-pull-request@v6`)**: 메이저 버전이 바뀌었을 수 있습니다. examples의 버전이 비교적 최신이지만 사용 시점에 따라 `@v7`으로 바꿔 사용합니다.
- **시간대 환산**: cron 은 UTC. KST = UTC+9. 매일 자정 KST = 전일 15:00 UTC = `0 15 * * *` (월요일 = 일요일 15:00 UTC). conventions.md § Cron 시간대 표 참고
- **빈 결과**: 정상 동작인데 그 기간에 거래가 없으면 `count=0` 인 `kind=Succeeded`. P4 의 `if-no-files-found: error` 옵션이 그래도 빈 파일이라도 떨어지는지 안전망 역할
