# GitLab CI/CD 가이드

## 파이프라인 동작

- Merge Request 파이프라인은 변경된 영역에 대해서만 검증 잡을 실행합니다.
- `feat/*`, `fix/*`, `hotfix/*`, `release`, `develop`, `master` 브랜치에서 파이프라인이 실행됩니다.
- `develop` 브랜치에서는 관련 파일이 변경되고 CI가 성공하면 `staging` 배포를 수행합니다.
- 현재 구성은 `staging`만 대상으로 하므로 `master`에서는 자동 배포하지 않습니다.

## 잡 구성

- `FE`: `npm ci`, `npm run lint`, `npm run build`
- `BE`: `./gradlew test`, `./gradlew bootJar -x test`
- `AI`: `uv sync --locked --dev`, `uv run ruff check .`, `uv run pytest`, import smoke test

## 필수 GitLab CI/CD 변수

- `STAGING_ENV_FILE`
  - 타입: `Variable`
  - 범위: 가능하면 `staging` 환경 scope
  - 값: `INFRA/.env` 파일 전체 내용
  - Masked: 사용 안 함
  - Protected: `develop` 브랜치를 보호 브랜치로 운영하면 활성화 권장
- `DEPLOY_AI_PROFILE`
  - 선택 사항
  - 값: staging 서버에서 `worker` profile까지 같이 빌드하고 실행해야 하면 `true`

## Runner 요구사항

- staging shell runner 호스트에 Docker CLI가 설치되어 있어야 함
- `docker compose` 명령을 사용할 수 있어야 함
- shell runner 계정이 Docker 명령을 실행할 수 있어야 함
- shell runner 호스트에 `bash`가 있어야 함
- CI runner는 Node, Gradle, Maven, Python, `uv` 의존성을 내려받을 수 있어야 함

## 권장 Runner 구성

- `docker` 태그의 Docker executor runner: `FE`, `BE`, `AI` CI 잡 전용
- `deploy` 태그의 Shell executor runner: staging EC2에서 `staging:deploy` 배포 전용
- runner 태그명이 다르면 `.gitlab-ci.yml`의 `tags` 값을 같이 수정해야 함

## 운영 시 주의사항

- deploy 잡은 runner 호스트에 `.env` 파일을 생성하므로 runner 접근 권한과 GitLab 변수 권한을 제한해야 함
- `develop` 브랜치에서 staging 자동 배포가 부담되면 deploy 잡을 `when: manual`로 바꾸는 것이 안전함
- 현재 방식은 staging 호스트에서 이미지를 직접 빌드하므로 단순하지만, registry 기반 배포보다 느리고 재현성이 떨어질 수 있음
- `AI/Dockerfile`은 아직 `uv` workspace 구조와 완전히 맞지 않으므로, 현재 deploy 스크립트는 `DEPLOY_AI_PROFILE=true`일 때만 worker를 빌드하도록 구성되어 있음
- backend는 테스트는 있지만 별도 lint/static analysis 플러그인은 아직 Gradle에 붙어 있지 않음
