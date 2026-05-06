import uuid
import datetime
import time
from ai_common.adapters.rabbitmq.kombu_client import build_connection, COMMANDS_EXCHANGE
from ai_common.config import load_worker_settings
from ai_domain.worker_messages.command import CommandMessage, CommandInputRef, ExpectedOutputRef
from ai_domain.worker_messages.payloads_3d import ThreeDLlmCommandPayload
from ai_domain.worker_messages.payloads_ifc_edit import IfcEditCommandPayload

# 1. 3D LLM 기획 워커 설정
settings_3d = load_worker_settings(
    worker_type="THREE_D_LLM",
    worker_id="test-3d",
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


# 2. Authoring 워커 설정
settings_authoring = load_worker_settings(
    worker_type="IFC_EDIT_APPLY",
    worker_id="test-authoring",
    s3={"bucket": "test"},
)

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
        sourceIfcStorageUrl="s3://batang-artifacts/test/model.ifc",
        commandJsonStorageUrl="s3://batang-artifacts/test/3d-plan.json"
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

# 3D 워커로 발송
with build_connection(settings_3d.rabbitmq) as conn:
    with conn.Producer(serializer='json') as producer:
        producer.publish(
            command_3d,
            exchange=COMMANDS_EXCHANGE,
            routing_key="command.3d-llm.generate",
            declare=[COMMANDS_EXCHANGE]
        )
        print("[SUCCESS] 3D LLM 워커로 메시지 발송 완료")

time.sleep(1)

# Authoring 워커로 발송
with build_connection(settings_authoring.rabbitmq) as conn:
    with conn.Producer(serializer='json') as producer:
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
