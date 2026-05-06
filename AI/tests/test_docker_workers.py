"""도커 환경에서 3D LLM / Authoring 워커의 메시지 수신을 수동으로 검증하는 스크립트.

사용 전제:
  - docker compose --profile ai up 으로 워커 컨테이너가 기동된 상태
  - S3(MinIO)에 실제 IFC 파일이 없으므로 워커는 FAILED 이벤트를 발행함
  - 실서비스 환경에서는 실행하지 않음
"""

import datetime
import uuid

from ai_common.adapters.rabbitmq.kombu_client import COMMANDS_EXCHANGE, build_connection
from ai_common.config import load_worker_settings
from ai_domain.worker_messages.command import (
    CommandInputRef,
    CommandMessage,
    ExpectedOutputRef,
)
from ai_domain.worker_messages.payloads_3d import ThreeDLlmCommandPayload
from ai_domain.worker_messages.payloads_ifc_edit import IfcEditCommandPayload

# 발송에 필요한 RabbitMQ 설정만 로드한다 (worker_type은 큐 라우팅과 무관하게 설정용으로만 사용).
settings = load_worker_settings(
    worker_type="THREE_D_LLM",
    worker_id="test-sender",
    s3={"bucket": "test"},
)

command_3d = CommandMessage(
    messageId=str(uuid.uuid4()),
    schemaVersion="v1",
    messageType="COMMAND",
    commandType="THREE_D_LLM_GENERATE",
    routingKey="command.3d-llm.generate",
    jobId=str(uuid.uuid4()),
    jobStepId=str(uuid.uuid4()),
    stepNo=1,
    totalSteps=2,
    projectId=str(uuid.uuid4()),
    requestedBy=str(uuid.uuid4()),
    sourceRevisionId=str(uuid.uuid4()),
    sourceSceneStateId=str(uuid.uuid4()),
    sourceSceneType="IFC_MODEL",
    expectedOutputArtifactId=str(uuid.uuid4()),
    input=CommandInputRef(
        sourceIfcStorageUrl="s3://batang-artifacts/test/model.ifc"
    ),
    expectedOutput=ExpectedOutputRef(
        threeDPlanStorageUrl="s3://batang-artifacts/test/3d-plan.json"
    ),
    payload=ThreeDLlmCommandPayload(
        userInstruction="거실의 창문을 더 크게 만들어줘.",
        sourceSceneStorageUrl="s3://batang-artifacts/test/scene.json"
    ),
    attemptNo=1,
    maxAttempts=3,
    idempotencyKey=str(uuid.uuid4()),
    correlationId=str(uuid.uuid4()),
    createdAt=datetime.datetime.now(datetime.UTC)
).model_dump(by_alias=True, exclude_none=True)

command_authoring = CommandMessage(
    messageId=str(uuid.uuid4()),
    schemaVersion="v1",
    messageType="COMMAND",
    commandType="IFC_EDIT_APPLY",
    routingKey="command.ifc-edit.apply",
    jobId=str(uuid.uuid4()),
    jobStepId=str(uuid.uuid4()),
    stepNo=2,
    totalSteps=2,
    projectId=str(uuid.uuid4()),
    requestedBy=str(uuid.uuid4()),
    sourceRevisionId=str(uuid.uuid4()),
    sourceSceneStateId=str(uuid.uuid4()),
    sourceSceneType="IFC_MODEL",
    expectedOutputArtifactId=str(uuid.uuid4()),
    input=CommandInputRef(
        sourceIfcStorageUrl="s3://batang-artifacts/test/model.ifc"
    ),
    expectedOutput=ExpectedOutputRef(
        ifcStorageUrl="s3://batang-artifacts/test/rev_001/model.ifc",
        validationReportStorageUrl="s3://batang-artifacts/test/report.json"
    ),
    payload=IfcEditCommandPayload(
        commandJsonStorageUrl="s3://batang-artifacts/test/3d-plan.json"
    ),
    attemptNo=1,
    maxAttempts=3,
    idempotencyKey=str(uuid.uuid4()),
    correlationId=str(uuid.uuid4()),
    createdAt=datetime.datetime.now(datetime.UTC)
).model_dump(by_alias=True, exclude_none=True)


print("메시지를 발송합니다...")

with build_connection(settings.rabbitmq) as conn:
    with conn.Producer(serializer='json') as producer:
        producer.publish(
            command_3d,
            exchange=COMMANDS_EXCHANGE,
            routing_key="command.3d-llm.generate",
            declare=[COMMANDS_EXCHANGE]
        )
        print("[SUCCESS] 3D LLM 워커로 메시지 발송 완료")

        producer.publish(
            command_authoring,
            exchange=COMMANDS_EXCHANGE,
            routing_key="command.ifc-edit.apply",
            declare=[COMMANDS_EXCHANGE]
        )
        print("[SUCCESS] Authoring 워커로 메시지 발송 완료")

print("\n발송 완료! 아래 명령어로 워커 로그를 확인해보세요.")
print("docker logs batang-worker-planning-3d-local -f")
print("docker logs batang-worker-authoring-local -f")
