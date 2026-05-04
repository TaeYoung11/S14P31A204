# LLM Edit FE Handshake

## 목적
- 프론트는 캔버스를 직접 렌더링한다.
- 백엔드/AI는 이미지가 아닌 JSON 명령(`operations`)을 반환한다.

## 현재 프론트 준비 상태
- API 우선 호출 + 실패 시 mock fallback 지원
- 응답 정규화(`kind` / `status` 모두 허용)
- 잘못된 응답(이미지 기반 등) 차단
- 변경 미리보기 + 적용/취소 UI 완료

## 현재 고정 설정
- provider는 코드 상수(`LLM_EDIT_PROVIDER='api'`)로 고정한다.
- API endpoint는 `/projects/{projectId}/floor/command`를 사용한다.

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
