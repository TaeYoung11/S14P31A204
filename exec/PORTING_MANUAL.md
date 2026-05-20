# BATANG 포팅 매뉴얼 (빌드 & 배포)

GitLab 소스 클론부터 빌드·배포까지의 전 과정 정리. Docker Compose 기반 단일 호스트 배포 기준.

---

## 0. 사전 요구 (호스트)

| 항목 | 버전 / 비고 |
| :--- | :--- |
| OS | Ubuntu 22.04 LTS (운영, EC2) / Windows 11 (로컬 개발) |
| Docker Engine | 24+ |
| Docker Compose | v2 (`docker compose`) |
| Git | 2.30+ |
| (AI 렌더 GPU 사용 시) NVIDIA Driver | 535+ |
| (AI 렌더 GPU 사용 시) NVIDIA Container Toolkit | 최신 (`nvidia-ctk`) |
| (AI 렌더 GPU 사용 시) GPU | NVIDIA L4 (g6.2xlarge) 등 CUDA 12.6 호환, VRAM 16GB+ |

> Docker Compose 안에서 모든 런타임(JVM·Node·Python·DB·웹서버)을 컨테이너로 제공하므로, 호스트에는 별도 JDK/Node/Python 설치가 필요 없다.

---

## 1. 사용 제품 / 버전 / 설정

### 1.1 언어 · 런타임

| 구분 | 제품 | 버전 | 비고 |
| :--- | :--- | :--- | :--- |
| Backend 언어 | Java (Eclipse Temurin) | **21** | `BE/Dockerfile` `eclipse-temurin:21-jdk`(build) / `21-jre`(run) |
| Backend 빌드 | Gradle (wrapper) | **8.14.4** | `BE/gradle/wrapper/gradle-wrapper.properties` |
| Frontend 런타임 | Node.js (alpine) | **20** | `FE/Dockerfile` `node:20-alpine` |
| Frontend 빌드 | Vite | **5** | `npm run build` = `tsc -b && vite build` |
| AI 런타임 | Python (slim) | **3.11** | `AI/Dockerfile` `python:3.11-slim` |
| AI 패키지 매니저 | uv | 최신 | workspace 9 패키지 |

### 1.2 프레임워크 · WAS · 웹서버

| 구분 | 제품 | 버전 | 설정 |
| :--- | :--- | :--- | :--- |
| Backend 프레임워크 | Spring Boot | **3.5.13** | 내장 WAS **Tomcat** (embedded), 포트 `8080` (`expose`) |
| WAS | Apache Tomcat (Spring Boot 내장) | Spring Boot 3.5 번들 | 별도 외부 WAS 없음 (executable jar) |
| 리버스 프록시 / 정적 서빙 | **Nginx** | **1.27-alpine** | 포트 `80`. FE 정적 + BE/MinIO/RabbitMQ 프록시. 설정 `INFRA/nginx/default.conf` |
| FE 서빙 | Nginx (FE 컨테이너 내장) | 1.27-alpine | `FE/Dockerfile` 의 `nginx:1.27-alpine`, 빌드 산출물 `/usr/share/nginx/html` |

### 1.3 데이터 / 메시지 / 스토리지

| 구분 | 제품 | 버전 | 비고 |
| :--- | :--- | :--- | :--- |
| RDB | PostgreSQL | **16-alpine** | `batang-postgres`, 내부 포트 5432 |
| 캐시 / 세션 | Redis | **7-alpine** | `batang-redis`, appendonly + requirepass |
| 메시지 큐 | RabbitMQ | **4-management** | `batang-rabbitmq`, 5672 / 관리 15672 |
| 오브젝트 스토리지 | MinIO | `quay.io/minio/minio:latest` | `batang-minio`, API 9000 / Console 9001 |
| (테스트 DB) | H2 | runtime | BE 테스트 전용 |

### 1.4 AI 모델 / GPU 스택 (렌더 워커)

| 구분 | 제품 | 버전 |
| :--- | :--- | :--- |
| 딥러닝 | PyTorch | **2.11.0+cu126** (torchvision 0.26.0+cu126) |
| Diffusion | diffusers + ControlNet | SD 1.5 / Realistic Vision V6 / control_v11p_sd15_canny / sd-controlnet-depth |
| 초해상 | Real-ESRGAN x4plus | basicsr 1.4.2 / realesrgan 0.3.0 |
| IFC / 3D | ifcopenshell / Open3D | — |
| LLM (2D/3D) | Ollama + gemma3:4b / qwen2.5:7b | 호스트 또는 별도 컨테이너 |

### 1.5 IDE (팀 개발 환경 — 권장)

| 영역 | IDE |
| :--- | :--- |
| Backend | IntelliJ IDEA 2024.x (JDK 21) |
| Frontend | VS Code (ESLint / Prettier 확장) |
| AI | VS Code / PyCharm (Python 3.11, uv) |

---

## 2. 빌드 / 환경 변수

### 2.1 환경 변수 파일

루트 배포 디렉토리는 **`INFRA/`**. 환경 변수는 **`INFRA/.env`** 한 파일에 모으며, 템플릿은 `INFRA/.env.example`.

```bash
cd INFRA
cp .env.example .env
vi .env   # 아래 필수 값 채우기
```

### 2.2 빌드 시 주입되는 변수 (FE — build arg)

FE 는 Vite 특성상 **빌드 시점에 값이 번들에 박힘** → `.env` 변경 후 반드시 재빌드.

| 변수 | 용도 | 비고 |
| :--- | :--- | :--- |
| `VITE_API_URL` | API base path | 기본 `/api/v1` |
| `VITE_KAKAO_MAP_API_KEY` | 카카오맵 JS 키 | **Kakao 콘솔에 배포 도메인 등록 필수** |

### 2.3 런타임 환경 변수 (BE)

| 변수 | 설명 | 필수 | 기본값 |
| :--- | :--- | :--- | :--- |
| `SPRING_PROFILES_ACTIVE` | 프로파일 | | `docker` |
| `SPRING_DATASOURCE_URL` | PG JDBC URL | | `jdbc:postgresql://postgres:5432/batang` |
| `SPRING_DATASOURCE_USERNAME` / `_PASSWORD` | PG 계정 | | `batang` / `batang` |
| `SPRING_SQL_INIT_MODE` | 스키마 초기화 | | `always` (운영은 `never` 권장) |
| `SPRING_REDIS_HOST` / `_PORT` / `_PASSWORD` | Redis | | `redis` / `6379` / `batang` |
| `SPRING_RABBITMQ_HOST` / `_PORT` / `_USERNAME` / `_PASSWORD` | RabbitMQ | | `rabbitmq` / `5672` / `guest` / `guest` |
| `JWT_SECRET` | JWT 서명 키 | ✅ | (없음 — `openssl rand -hex 64`) |
| `MAIL_USERNAME` / `MAIL_PASSWORD` | Gmail SMTP (이메일 인증) | ✅ | (없음 — Gmail App Password) |
| `VWORLD_API_KEY` | 지번(대지정보) API 키 | △ | (없으면 부지 등록 제한) |
| `VWORLD_REFERER` | VWorld 등록 Referer | △ | 배포 도메인 |
| `AWS_REGION` | S3 region | | `us-east-1` |
| `AWS_S3_ENDPOINT_URL` | S3 내부 endpoint | | `http://minio:9000` |
| `AWS_S3_PUBLIC_ENDPOINT_URL` | presigned URL 외부 endpoint | ✅(운영) | `http://${SERVER_IP}` |
| `AWS_S3_BUCKET` | 버킷명 | | `batang-artifacts` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 자격 | | `minio` / `minio123` |

### 2.4 런타임 환경 변수 (AI 워커 공통)

| 변수 | 설명 | 기본값 |
| :--- | :--- | :--- |
| `WORKER_TYPE` | 워커 종류 (`SD_RENDER_GENERATE` / `IFC_GENERATE_FROM_BUBBLE` / `TWO_D_LLM` / `THREE_D_LLM` / `IFC_EDIT_APPLY`) | (서비스별 고정) |
| `RABBITMQ_HOST` / `_PORT` / `_USERNAME` / `_PASSWORD` / `_VHOST` | 큐 접속 | rabbitmq / 5672 / guest / guest / `/` |
| `RABBITMQ_HEARTBEAT` | 렌더 워커 heartbeat (긴 GPU 작업 대비) | 렌더 `600`, 그 외 `60` |
| `S3_BUCKET` / `S3_ENDPOINT_URL` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_REGION` | S3 | minio 기본 |

### 2.5 AI LLM / 렌더 전용 변수

| 변수 | 설명 | 기본값 |
| :--- | :--- | :--- |
| `TWO_D_LLM_BASE_URL` / `TWO_D_LLM_MODEL_NAME` / `TWO_D_LLM_API_KEY` | 2D LLM (Ollama) | `http://host.docker.internal:11434/v1` / `gemma3:4b` / `ollama` |
| `LLM_BASE_URL` / `LLM_MODEL_NAME` / `LLM_API_KEY` | 3D LLM (Ollama) | `http://host.docker.internal:11434/v1` / `qwen2.5:7b` / `ollama` |
| `HF_HOME` | HuggingFace 모델 캐시 | `/models/huggingface` (named volume `hf-cache`) |
| `IFC2IMG_REALESRGAN_CACHE_DIR` | Real-ESRGAN weight 캐시 | `/models/realesrgan` (동일 볼륨) |
| `RENDERING_RABBITMQ_HEARTBEAT` | 렌더 heartbeat override | `600` |
| (선택) `HF_TOKEN` | HuggingFace rate limit 완화 | (미설정) |

### 2.6 빌드 명령

```bash
cd INFRA

# 전체 빌드 + 기동 (AI 렌더 워커 제외 — 기본)
docker compose up -d --build

# AI 렌더 워커 포함 (GPU 필요)
docker compose --profile ai up -d --build
```

개별 빌드 명령(컨테이너 안에서 실행되는 실제 빌드):
- BE: `./gradlew clean bootJar -x test --no-daemon` → `build/libs/*.jar`
- FE: `npm ci && npm run build` → `dist/` → Nginx 정적 서빙
- AI: `pip install -e ./packages/*` (+ 렌더 stage 는 `torch==2.11.0+cu126 torchvision==0.26.0+cu126`)

---

## 3. 배포 시 특이사항

1. **`.env` 필수값 미설정 시 BE 기동 실패**
   - `JWT_SECRET`, `MAIL_USERNAME`, `MAIL_PASSWORD` 는 default 가 없음. 비우면 컨테이너 부팅 실패.

2. **FE 빌드 시점 환경변수**
   - `VITE_KAKAO_MAP_API_KEY` 등은 **빌드 arg** 라 `.env` 변경 후 `docker compose build fe` 재빌드 필요. 런타임 교체 불가.
   - **Kakao 콘솔에 배포 도메인 등록** 안 하면 `domain mismatched` 로 지도 로드 실패.

3. **AI 렌더 워커는 `--profile ai` 로만 기동**
   - 기본 `docker compose up` 에는 포함 안 됨 (GPU 의존). GPU 없는 호스트에서 `--profile ai` 주면 device reservation 실패로 기동 막힐 수 있음.
   - GPU 사용 시 호스트에 NVIDIA Driver + nvidia-container-toolkit 필수.
   - 첫 렌더 잡 시 HuggingFace 모델 ~9GB 다운로드 (`hf-cache` 볼륨에 영속). 콜드 스타트 5~10분.

4. **GPU torch wheel pin**
   - `AI/Dockerfile` 의 ai-rendering stage 가 `--index-url .../cu126` 로 torch/torchvision 을 CUDA wheel 로 고정 설치. CPU wheel 로 빌드되면 GPU 미사용.

5. **MinIO 버킷 자동 생성**
   - `minio-init` 컨테이너가 `AWS_S3_BUCKET` 버킷을 자동 `mc mb`. 별도 수동 생성 불필요.

6. **포트 바인딩 정책**
   - 외부 노출: Nginx `80` 만.
   - MinIO(9000/9001) / RabbitMQ(15672) 는 `127.0.0.1` bind → Nginx 경유로만 접근. (Windows Docker Desktop 에서 `127.0.0.1` 바인딩 버그 시 `0.0.0.0` 으로 우회)

7. **LLM(Ollama) 외부 의존**
   - 2D/3D LLM 워커는 `host.docker.internal:11434` 의 Ollama 를 호출. EC2(Linux) 에서는 docker-compose 에 `extra_hosts: ["host.docker.internal:host-gateway"]` 추가 + 호스트에 Ollama 설치/모델 pull 필요.

8. **CI/CD (GitLab)**
   - 파이프라인 5 stage: `prepare → lint → test → build → deploy`.
   - 변경 경로별 분리 (`FE/**`, `BE/**`, `AI/**`).
   - `develop` push 시 `staging:deploy` 자동 실행 (`INFRA/scripts/deploy-staging.sh`). `STAGING_ENV_FILE` 변수 필요.

9. **스키마 초기화**
   - `SPRING_SQL_INIT_MODE=always` + `spring.jpa.hibernate.ddl-auto=update`. 초기 구동 시 `schema-postgresql.sql` + JPA ddl-update 로 테이블 생성. 운영 안정화 후 `never` 권장.

---

## 4. DB 접속 정보 / 주요 계정 / 프로퍼티 파일

### 4.1 프로퍼티 / 설정 파일 목록

| 파일 | 역할 |
| :--- | :--- |
| `INFRA/.env` | **모든 시크릿·접속정보의 단일 소스** (git 미포함) |
| `INFRA/.env.example` | env 템플릿 (git 포함, 값 비어있음) |
| `INFRA/docker-compose.yml` | 서비스·포트·볼륨·env 매핑 |
| `INFRA/nginx/default.conf` | Nginx 라우팅 (FE / `/api/` / `/minio/` / `/batang-artifacts/` 등) |
| `BE/src/main/resources/application.properties` | Spring 설정 (env 참조) |
| `BE/src/main/resources/schema-postgresql.sql` | 초기 스키마 |
| `BE/build.gradle` | BE 의존성·빌드 |
| `FE/package.json` / `FE/eslint.config.js` / `FE/vite.config.ts` | FE 빌드·린트 |
| `AI/pyproject.toml` / `AI/uv.lock` | AI 의존성 (torch cu126 index 포함) |
| `AI/Dockerfile` / `BE/Dockerfile` / `FE/Dockerfile` | 컨테이너 빌드 |

### 4.2 주요 계정 (기본값 — 운영 시 반드시 변경)

| 시스템 | 계정 | 기본 비밀번호 | env 변수 |
| :--- | :--- | :--- | :--- |
| PostgreSQL | `batang` | `batang` | `POSTGRES_USER` / `POSTGRES_PASSWORD` |
| Redis | (계정 없음) | `batang` | `SPRING_REDIS_PASSWORD` |
| RabbitMQ | `guest` | `guest` | `RABBITMQ_DEFAULT_USER` / `_PASS` |
| MinIO | `minio` | `minio123` | `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` |
| JWT | — | (랜덤) | `JWT_SECRET` |
| Gmail SMTP | (운영 계정) | (App Password) | `MAIL_USERNAME` / `MAIL_PASSWORD` |

> ⚠ 운영 배포 시 위 기본 비밀번호는 모두 강력한 값으로 교체. `.env` 는 절대 git 에 커밋하지 않음.

### 4.3 DB 접속 정보 (운영 기준)

```
Host:     postgres (컨테이너 내부) / EC2 내부망
Port:     5432
Database: batang
User:     batang
Password: ${POSTGRES_PASSWORD}
Driver:   org.postgresql.Driver
JDBC URL: jdbc:postgresql://postgres:5432/batang
```

ERD / 테이블 정의는 [BE/ERD_TABLES.md](BE/ERD_TABLES.md) 참고.

### 4.4 외부 DB 접속 (컨테이너 밖에서 디버깅)

PostgreSQL 은 기본적으로 외부 포트 미노출(내부망). 필요 시:

```bash
# 컨테이너 내부 psql
docker exec -it batang-postgres psql -U batang -d batang

# 또는 docker-compose 에 ports: ["5432:5432"] 임시 추가 후 외부 클라이언트 접속
```

---

## 5. 배포 절차 요약

```bash
# 1. 클론
git clone <repo-url> && cd S14P31A204/INFRA

# 2. 환경변수
cp .env.example .env
#   JWT_SECRET=$(openssl rand -hex 64)
#   MAIL_USERNAME / MAIL_PASSWORD / VITE_KAKAO_MAP_API_KEY / VWORLD_API_KEY
#   SERVER_IP / AWS_S3_PUBLIC_ENDPOINT_URL (운영 도메인)
#   운영 비밀번호 일괄 변경

# 3. (GPU 렌더 사용 시) Ollama + 모델
curl -fsSL https://ollama.com/install.sh | sh
ollama pull gemma3:4b && ollama pull qwen2.5:7b

# 4. 기동
docker compose up -d --build                 # 기본 (BE/FE/DB/큐/스토리지 + LLM·IFC 워커)
docker compose --profile ai up -d --build    # + SD 렌더 워커 (GPU)

# 5. 확인
docker compose ps
curl -I http://localhost            # Nginx → FE
curl -I http://localhost/api/v1/...
docker exec batang-worker-rendering python -c "import torch; print(torch.cuda.is_available())"   # GPU 확인

# 6. 접속
#   FE:        http://<도메인>
#   Swagger:   http://<도메인>/swagger-ui/index.html
#   MinIO:     http://<도메인>:9001 (또는 /minio/)
#   RabbitMQ:  http://<도메인>:15672
```
