# 메시징 계약

queue 이름, message schema 이름, DTO 이름은 서로 다른 개념입니다.

## 이름 규칙

| Queue | Message schema | Publisher | Consumer |
| --- | --- | --- | --- |
| `plan-queue` | `plan_request` | BE | `ai-planning` |
| `planning-result-queue` | `plan_result` | `ai-planning` | BE 또는 orchestrator |
| `execution-queue` | `execution_request` | BE 또는 orchestrator | `ai-authoring` |
| `execution-result-queue` | `execution_result` | `ai-authoring` | BE 또는 orchestrator |

## 메시지 구조

모든 queue message는 envelope과 payload를 분리한 구조를 사용합니다.

```json
{
  "envelope": {
    "message_id": "msg-1",
    "schema": "plan_request",
    "schema_version": "v1",
    "request_id": "req-1",
    "correlation_id": "corr-1",
    "project_id": "project-1",
    "job_id": "job-1",
    "revision_id": null,
    "causation_id": null,
    "created_at": "2026-04-22T00:00:00Z"
  },
  "payload": {}
}
```

JSON wire field는 `snake_case`를 사용합니다.

## Floor-plan Generate

`/floor-plans/generate`의 현재 BE 기준 계약은 아래 문서를 따른다.

- `shared/docs/floor-plan-generate-contract.md`

## Retry와 DLQ

초기 세팅에서는 RabbitMQ retry, acknowledgement, DLQ routing을 구현하지
않습니다. 실제 queue client를 구현할 때 이 책임을 확정해야 합니다.

예약된 기본 정책은 다음과 같습니다.

- schema validation 실패는 DLQ로 보냅니다.
- 워커 처리 실패는 DLQ로 보내기 전에 retry합니다.
- retry 횟수와 backoff는 queue별로 정합니다.
