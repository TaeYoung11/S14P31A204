# 🏗️ BIM 3D Service

> **자연어로 BIM을 수정하고, 즉시 3D로 확인하는 인터랙티브 서비스**

[![Python](https://img.shields.io/badge/Python-3.11+-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-blue)](https://reactjs.org)
[![Three.js](https://img.shields.io/badge/Three.js-r165+-black)](https://threejs.org)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 📌 서비스 개요

사용자가 채팅창에 한국어(자연어)로 건물 수정 명령을 입력하면:

1. **로컬 LLM**(Qwen2.5-7B)이 자연어를 BIM 명령 구조체(JSON)로 파싱
2. **BIM 엔진**(IfcOpenShell)이 IFC 파일을 실시간으로 수정
3. **3D 뷰어**(IFC.js + Three.js)가 변경 결과를 즉시 브라우저에 렌더링

```
사용자: "3층 회의실 벽을 유리로 바꾸고 창문 2개 추가해줘"
   ↓ LLM (Qwen2.5-7B via Ollama)
   ↓ BIM 명령 JSON 생성
   ↓ IfcOpenShell로 IFC 수정
   ↓ WebSocket Delta 전송
   ↓ Three.js 씬 업데이트
브라우저: [3D 모델 실시간 변경 확인]
```

---

## 🖥️ 시스템 요구사항

| 항목 | 최소 | 권장 |
|------|------|------|
| GPU | RTX 4050 Laptop (6GB VRAM) | RTX 4070+ |
| RAM | 16GB | 32GB |
| 디스크 | 20GB (모델 포함) | 50GB |
| OS | Windows 10/11, Ubuntu 22.04 | Ubuntu 22.04 |
| Python | 3.11+ | 3.11 |
| Node.js | 18+ | 20 LTS |

> ✅ **현재 환경 (RTX 4050 Laptop, 6GB VRAM)**: Qwen2.5-7B Q4_K_M 모델 사용 → 약 4.5GB VRAM, 30~40 tok/s

---

## 🗂️ 프로젝트 구조

```
BIM_3D_service/
├── README.md                  # 이 파일
├── docker-compose.yml         # 전체 서비스 구성
├── .env.example               # 환경변수 예시
│
├── docs/                      # 상세 문서
│   ├── architecture.md        # 시스템 아키텍처
│   ├── api-design.md          # API 설계
│   ├── development-plan.md    # 개발 계획 (Phase별)
│   ├── nlp-design.md          # NLP/LLM 설계
│   └── bim-engine.md          # BIM 엔진 설계
│
├── backend/                   # FastAPI 백엔드
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── router.py
│   │   │   └── websocket.py
│   │   ├── services/
│   │   │   ├── nlp_service.py
│   │   │   ├── bim_service.py
│   │   │   └── diff_service.py
│   │   ├── models/
│   │   │   └── bim_command.py
│   │   └── core/
│   │       ├── config.py
│   │       └── database.py
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                  # React 3D 뷰어
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatPanel/
│   │   │   ├── Viewer3D/
│   │   │   ├── HistoryPanel/
│   │   │   └── PropertyPanel/
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   └── useBIMModel.ts
│   │   └── types/
│   │       └── bim.types.ts
│   ├── package.json
│   └── Dockerfile
│
└── scripts/                   # 유틸리티 스크립트
    ├── setup.sh               # 환경 초기화
    └── download_model.sh      # LLM 모델 다운로드
```

---

## 🚀 빠른 시작

### 1. Ollama 설치 및 모델 다운로드

```bash
# Ollama 설치 (https://ollama.com)
curl -fsSL https://ollama.com/install.sh | sh

# Qwen2.5-7B 다운로드 (약 4.7GB)
ollama pull qwen2.5:7b

# 모델 로드 확인
ollama ps
```

### 2. 백엔드 실행

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### 4. Docker Compose (전체 실행)

```bash
docker-compose up -d
# → http://localhost:3000
```

---

## 📚 문서 목록

| 문서 | 설명 |
|------|------|
| [아키텍처](docs/architecture.md) | 전체 시스템 구조, 데이터 흐름 |
| [API 설계](docs/api-design.md) | REST API, WebSocket 명세 |
| [개발 계획](docs/development-plan.md) | Phase별 구현 로드맵 |
| [NLP 설계](docs/nlp-design.md) | LLM 프롬프트, Function Calling 설계 |
| [BIM 엔진](docs/bim-engine.md) | IfcOpenShell 기반 IFC 수정 로직 |

---

## 🛠️ 기술 스택

### Backend
- **FastAPI** - 비동기 REST API 서버
- **IfcOpenShell** - IFC BIM 파일 파싱 및 수정
- **Ollama** - 로컬 LLM 서버 (Qwen2.5-7B)
- **instructor** - Pydantic 기반 구조화 LLM 출력
- **WebSocket** - 실시간 양방향 통신
- **PostgreSQL** - 프로젝트 메타데이터
- **Redis** - 세션, 작업 큐

### Frontend
- **React 18** - UI 프레임워크
- **Three.js** - WebGL 3D 렌더링
- **IFC.js (web-ifc-three)** - IFC → Three.js 변환
- **Vite** - 빌드 도구
- **Zustand** - 상태 관리

### AI/NLP
- **Qwen2.5-7B-Instruct** - 오픈소스 LLM (한국어 우수)
- **Ollama** - 로컬 GPU 추론 서버
- **instructor** - 구조화 JSON 출력 보장

---

## 📋 라이선스

MIT License - 자세한 내용은 [LICENSE](LICENSE) 참조
