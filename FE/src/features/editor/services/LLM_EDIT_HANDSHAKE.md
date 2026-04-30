# LLM Edit FE Handshake

## 목적
- 프론트는 캔버스를 직접 렌더링한다.
- 백엔드/AI는 이미지가 아닌 JSON 명령(`operations`)을 반환한다.

## 현재 프론트 준비 상태
- `mock` / `api` provider 전환 지원
- 응답 정규화(`kind` / `status` 모두 허용)
- 잘못된 응답(이미지 기반 등) 차단
- 변경 미리보기 + 적용/취소 UI 완료

## 환경변수
- `VITE_LLM_EDIT_PROVIDER=mock|api`
- `VITE_LLM_EDIT_ENDPOINT_TEMPLATE=/projects/{projectId}/floor/command`

## 요청 본문
```json
{
  "text": "거실과 주방 연결 추가해줘",
  "context": {
    "bubbles": [],
    "connections": []
  }
}
```

## 응답 권장 포맷
```json
{
  "kind": "ok",
  "summary": "요청한 두 공간 사이에 연결을 추가합니다.",
  "operations": [
    {
      "kind": "add_connection",
      "fromId": "room-a",
      "toId": "room-b",
      "style": "thin"
    }
  ]
}
```

## 모호/오류 포맷
```json
{ "kind": "ambiguous", "message": "대상이 모호합니다.", "suggestions": ["..."] }
```

```json
{ "kind": "error", "message": "처리 중 오류가 발생했습니다." }
```
