# BATANG 외부 서비스 정보

프로젝트에서 사용하는 외부 서비스의 가입·발급·설정 정보 정리. 키/시크릿 실제 값은 `INFRA/.env` 에만 보관하며 이 문서에는 적지 않는다.

---

## 요약

| 서비스 | 용도 | 가입 필요 | 키 발급 | 비용 | 사용 위치 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **VWorld (공간정보 오픈플랫폼)** | 지번(대지) 정보 조회 | ✅ | API 인증키 | 무료 | BE |
| **Kakao Maps** | 지도 표시 / 주소 선택 | ✅ | JavaScript 키 | 무료 | FE |
| **Gmail SMTP** | 회원가입 이메일 인증 발송 | ✅ (Google 계정) | 앱 비밀번호 | 무료 | BE |
| **HuggingFace Hub** | AI 모델 weight 다운로드 | △ (선택) | Read 토큰(선택) | 무료 | AI 렌더 워커 |
| **Ollama** | 2D/3D LLM 추론 (self-host) | ❌ | 없음 | 무료(자체 호스팅) | AI LLM 워커 |
| **AWS S3** (운영 선택) | 산출물/IFC 저장 | ✅ (AWS) | IAM 키 또는 Role | 사용량 과금 | BE / AI (MinIO 대체 시) |

> 로컬/스테이징은 **MinIO** 로 S3 를 대체하므로 AWS 가입 없이도 전체 동작 가능.

---

## 1. VWorld — 공간정보 오픈플랫폼 (지번/대지 정보)

부지 등록 시 지번(PNU)·주소·경계 폴리곤을 조회하는 국토교통부 오픈 API.

### 가입 / 키 발급
1. https://www.vworld.kr 접속 → 회원가입
2. **마이페이지 → 오픈API → 인증키 발급 신청**
3. 활용 API: **2D 지적도(Cadastral) 데이터 API**
4. 발급 시 **서비스 URL(Referer)** 등록 필요 → 배포 도메인 입력 (예: `http://batang.ai.kr`)

### 설정 (`INFRA/.env`)
```bash
VWORLD_API_KEY=<발급키>
VWORLD_BASE_URL=https://apis.vworld.kr
VWORLD_CADASTRAL_PATH=/2ddata/cadastral/data
VWORLD_REFERER=<등록한 도메인>     # 키 발급 시 등록한 Referer 와 일치해야 함
VWORLD_OUTPUT=json
VWORLD_SRS_NAME=EPSG:4326
VWORLD_PROPERTY_NAME=pnu,jibun,bonbun,bubun,ag_geom,addr
VWORLD_BUFFER=10
VWORLD_TIMEOUT_SECONDS=3
```

### 특이사항
- **Referer 불일치 시 호출 거부** — 발급 시 등록한 도메인과 `VWORLD_REFERER` 가 같아야 함
- 사용 위치: `BE/.../project/infrastructure/VworldCadastralClient.java`
- 키 없으면 부지 등록 기능만 제한, 나머지 동작은 정상

---

## 2. Kakao Maps — 지도 / 주소 검색 (FE)

부지 등록 모달의 지도 표시·좌표 선택, 주소 검색(Daum Postcode)에 사용.

### 가입 / 키 발급
1. https://developers.kakao.com 접속 → 카카오 계정 로그인
2. **내 애플리케이션 → 애플리케이션 추가**
3. **앱 설정 → 앱 키 → JavaScript 키** 복사 (REST/Admin 키 아님 — JS 키)
4. **앱 설정 → 플랫폼 → Web → 사이트 도메인 등록**
   - 로컬: `http://localhost`, `http://127.0.0.1`
   - 운영: `http://<배포 도메인>`

### 설정 (`INFRA/.env`)
```bash
VITE_KAKAO_MAP_API_KEY=<JavaScript 키>
```

### 특이사항
- ⚠ **빌드 시점 변수** (Vite) — `.env` 변경 후 `docker compose build fe` 재빌드 필요
- ⚠ **도메인 미등록 시** `domain mismatched! caller=...` 로 SDK 로드 실패 → 콘솔에 배포 도메인 반드시 등록
- SDK URL: `https://dapi.kakao.com/v2/maps/sdk.js?appkey=...&libraries=services`
- 사용 위치: `FE/src/features/project/utils/kakaoMapSdk.ts`, `react-daum-postcode`

---

## 3. Gmail SMTP — 이메일 인증 발송 (BE)

회원가입 시 이메일 인증 코드 발송에 Gmail SMTP 사용.

### 가입 / 발급
1. 발송용 Google 계정 준비 (또는 신규 생성)
2. **Google 계정 → 보안 → 2단계 인증 활성화** (앱 비밀번호 발급 전제 조건)
3. **보안 → 앱 비밀번호** → "메일" 용 16자리 앱 비밀번호 생성
4. 일반 계정 비밀번호가 아닌 **앱 비밀번호** 를 사용

### 설정 (`INFRA/.env`)
```bash
MAIL_USERNAME=<발송 Gmail 주소>
MAIL_PASSWORD=<16자리 앱 비밀번호>
```

### 고정 설정 (`application.properties`, 변경 불필요)
```properties
spring.mail.host=smtp.gmail.com
spring.mail.port=587
spring.mail.properties.mail.smtp.auth=true
spring.mail.properties.mail.smtp.starttls.enable=true
```

### 특이사항
- ⚠ `MAIL_USERNAME` / `MAIL_PASSWORD` **미설정 시 BE 컨테이너 기동 실패** (default 없음)
- Gmail 무료 일일 발송 한도(~500통) 존재 — 시연 규모엔 충분
- 사용 위치: `BE/.../auth` (이메일 인증 코드 발송 흐름)

---

## 4. HuggingFace Hub — AI 모델 다운로드 (AI 렌더 워커)

SD 1.5 / Realistic Vision V6 / ControlNet / Real-ESRGAN weight 를 받는 모델 허브.

### 가입 / 토큰 (선택)
- 사용 모델 5종 모두 **public** → 가입·토큰 없이 다운로드 가능
- 단, 익명은 rate limit 낮음. 운영/다중 워커면 토큰 권장:
  1. https://huggingface.co 가입
  2. **Settings → Access Tokens → New token (Read 권한)**

### 설정 (`INFRA/.env`, 선택)
```bash
HF_TOKEN=<hf_xxxxxxxx>           # 선택 — rate limit 완화 + 빠른 다운로드
HF_HOME=/models/huggingface      # 모델 캐시 (named volume 영속)
```

### 다운로드 대상 모델
| 모델 | repo | 크기 |
| :--- | :--- | :--- |
| Stable Diffusion 1.5 | `runwayml/stable-diffusion-v1-5` | ~4GB |
| Realistic Vision V6 | `SG161222/Realistic_Vision_V6.0_B1_noVAE` | ~2GB |
| ControlNet depth | `lllyasviel/sd-controlnet-depth` | ~1.4GB |
| ControlNet canny v1.1 | `lllyasviel/control_v11p_sd15_canny` | ~1.4GB |
| Real-ESRGAN x4plus | GitHub release (`.pth`) | ~70MB |

### 특이사항
- 첫 렌더 잡 시 ~9GB 다운로드 → `hf-cache` named volume 에 영속 (재기동 시 재다운로드 없음)
- 익명 호출 시 `unauthenticated requests` 경고 로그 (동작엔 영향 없음)

---

## 5. Ollama — 로컬 LLM (AI 2D/3D 편집 워커)

자연어 IFC 편집 명령을 해석하는 LLM. **외부 SaaS 가 아니라 self-hosted** — 가입/키 불필요.

### 설치 / 모델
```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama
ollama pull gemma3:4b      # 2D LLM
ollama pull qwen2.5:7b     # 3D LLM
```

### 설정 (`INFRA/.env`)
```bash
TWO_D_LLM_BASE_URL=http://host.docker.internal:11434/v1
TWO_D_LLM_MODEL_NAME=gemma3:4b
TWO_D_LLM_API_KEY=ollama
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_MODEL_NAME=qwen2.5:7b
LLM_API_KEY=ollama
```

### 특이사항
- EC2(Linux) 에서는 `host.docker.internal` 자동 매핑 안 됨 → docker-compose 에 `extra_hosts: ["host.docker.internal:host-gateway"]` 추가
- OpenAI 호환 API(`/v1`) 라 `instructor` + OpenAI 클라이언트로 호출 (API 키는 형식상 `ollama` 더미)
- 클라우드 LLM(OpenAI 등)으로 교체하려면 `LLM_BASE_URL` / `LLM_API_KEY` 만 실제 값으로 변경

---

## 6. AWS S3 — 오브젝트 스토리지 (운영 선택)

산출물(IFC / 렌더 이미지) 저장. **로컬·스테이징은 MinIO 로 대체** 하므로 필수 아님.

### 가입 / 발급 (실 S3 사용 시)
1. AWS 계정 → S3 버킷 생성
2. IAM 사용자(액세스 키) 또는 EC2 Instance Role 부여 (S3 read/write 권한)

### 설정 (`INFRA/.env`)
```bash
# MinIO (기본 — 로컬/스테이징)
AWS_S3_ENDPOINT_URL=http://minio:9000
AWS_ACCESS_KEY_ID=minio
AWS_SECRET_ACCESS_KEY=minio123
AWS_S3_BUCKET=batang-artifacts

# 실 AWS S3 사용 시
# AWS_S3_ENDPOINT_URL=           (비움 → 기본 AWS endpoint)
# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY = IAM 키 (또는 Role 사용 시 생략)
# AWS_REGION=ap-northeast-2
```

### 특이사항
- `AWS_S3_PUBLIC_ENDPOINT_URL` 은 FE 가 받을 presigned URL 의 외부 endpoint — 배포 도메인으로 설정
- MinIO ↔ 실 S3 전환은 endpoint/자격만 교체하면 코드 변경 없음

---

## .env 시크릿 체크리스트 (배포 전)

```bash
# 외부 서비스 키
VWORLD_API_KEY=                # VWorld (지번)
VITE_KAKAO_MAP_API_KEY=        # Kakao Maps (FE 빌드 arg)
MAIL_USERNAME=                 # Gmail 주소
MAIL_PASSWORD=                 # Gmail 앱 비밀번호
HF_TOKEN=                      # (선택) HuggingFace
# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  # 실 S3 사용 시

# 도메인 등록 필요 (서비스 콘솔에서)
#  - Kakao 콘솔: Web 플랫폼 사이트 도메인
#  - VWorld: 인증키 Referer
```

> ⚠ 위 값들은 `INFRA/.env` 에만 두고 **git 에 절대 커밋하지 않는다**. `.env.example` 에는 빈 값만 유지.
