package com.a204.batang.domain.floorplan.messaging;

import com.a204.batang.domain.floorplan.messaging.dto.FloorPlanGenerateCommandMessage;
import com.a204.batang.global.config.RabbitMqConfig;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

/**
 * Floor-plan generate command를 RabbitMQ로 발행한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FloorPlanGenerateCommandPublisher {

    public static final String HEADER_MESSAGE_ID = "x-floor-plan-message-id";
    public static final String HEADER_SCHEMA_VERSION = "x-floor-plan-schema-version";
    public static final String HEADER_MESSAGE_TYPE = "x-floor-plan-message-type";
    public static final String HEADER_COMMAND_TYPE = "x-floor-plan-command-type";
    public static final String HEADER_ROUTING_KEY = "x-floor-plan-routing-key";
    public static final String HEADER_JOB_ID = "x-floor-plan-job-id";
    public static final String HEADER_JOB_STEP_ID = "x-floor-plan-job-step-id";
    public static final String HEADER_STEP_NO = "x-floor-plan-step-no";
    public static final String HEADER_TOTAL_STEPS = "x-floor-plan-total-steps";
    public static final String HEADER_PROJECT_ID = "x-floor-plan-project-id";
    public static final String HEADER_REQUESTED_BY = "x-floor-plan-requested-by";
    public static final String HEADER_SOURCE_SCENE_TYPE = "x-floor-plan-source-scene-type";
    public static final String HEADER_TARGET_REVISION_ID = "x-floor-plan-target-revision-id";
    public static final String HEADER_EXPECTED_OUTPUT_ARTIFACT_ID = "x-floor-plan-expected-output-artifact-id";
    public static final String HEADER_ATTEMPT_NO = "x-floor-plan-attempt-no";
    public static final String HEADER_MAX_ATTEMPTS = "x-floor-plan-max-attempts";
    public static final String HEADER_IDEMPOTENCY_KEY = "x-floor-plan-idempotency-key";
    public static final String HEADER_CORRELATION_ID = "x-floor-plan-correlation-id";
    public static final String HEADER_CREATED_AT = "x-floor-plan-created-at";
    public static final String HEADER_IFC_STORAGE_URL = "x-floor-plan-ifc-storage-url";
    public static final String HEADER_VALIDATION_REPORT_STORAGE_URL = "x-floor-plan-validation-report-storage-url";

    private final RabbitTemplate rabbitTemplate;

    public void publish(FloorPlanGenerateCommandMessage message) {
        try {
            log.info(
                    "Floor-plan command 발행을 시도합니다. projectId={}, jobId={}, jobStepId={}, correlationId={}, attemptNo={}, maxAttempts={}",
                    message.projectId(),
                    message.jobId(),
                    message.jobStepId(),
                    message.correlationId(),
                    message.attemptNo(),
                    message.maxAttempts()
            );

            rabbitTemplate.convertAndSend(
                    RabbitMqConfig.COMMAND_EXCHANGE,
                    RabbitMqConfig.IFC_GENERATE_COMMAND_ROUTING_KEY,
                    message,
                    amqpMessage -> {
                        amqpMessage.getMessageProperties().setHeader(HEADER_MESSAGE_ID, message.messageId().toString());
                        amqpMessage.getMessageProperties().setHeader(HEADER_SCHEMA_VERSION, message.schemaVersion());
                        amqpMessage.getMessageProperties().setHeader(HEADER_MESSAGE_TYPE, message.messageType());
                        amqpMessage.getMessageProperties().setHeader(HEADER_COMMAND_TYPE, message.commandType());
                        amqpMessage.getMessageProperties().setHeader(HEADER_ROUTING_KEY, message.routingKey());
                        amqpMessage.getMessageProperties().setHeader(HEADER_JOB_ID, message.jobId().toString());
                        amqpMessage.getMessageProperties().setHeader(HEADER_JOB_STEP_ID, message.jobStepId().toString());
                        amqpMessage.getMessageProperties().setHeader(HEADER_STEP_NO, message.stepNo());
                        amqpMessage.getMessageProperties().setHeader(HEADER_TOTAL_STEPS, message.totalSteps());
                        amqpMessage.getMessageProperties().setHeader(HEADER_PROJECT_ID, message.projectId().toString());
                        amqpMessage.getMessageProperties().setHeader(HEADER_REQUESTED_BY, message.requestedBy().toString());
                        amqpMessage.getMessageProperties().setHeader(HEADER_SOURCE_SCENE_TYPE, message.sourceSceneType());
                        amqpMessage.getMessageProperties().setHeader(HEADER_TARGET_REVISION_ID, message.targetRevisionId().toString());
                        amqpMessage.getMessageProperties().setHeader(
                                HEADER_EXPECTED_OUTPUT_ARTIFACT_ID,
                                message.expectedOutputArtifactId().toString()
                        );
                        amqpMessage.getMessageProperties().setHeader(HEADER_ATTEMPT_NO, message.attemptNo());
                        amqpMessage.getMessageProperties().setHeader(HEADER_MAX_ATTEMPTS, message.maxAttempts());
                        amqpMessage.getMessageProperties().setHeader(HEADER_IDEMPOTENCY_KEY, message.idempotencyKey());
                        amqpMessage.getMessageProperties().setHeader(HEADER_CORRELATION_ID, message.correlationId().toString());
                        amqpMessage.getMessageProperties().setHeader(HEADER_CREATED_AT, message.createdAt().toString());
                        amqpMessage.getMessageProperties().setHeader(
                                HEADER_IFC_STORAGE_URL,
                                message.expectedOutput().ifcStorageUrl()
                        );
                        amqpMessage.getMessageProperties().setHeader(
                                HEADER_VALIDATION_REPORT_STORAGE_URL,
                                message.expectedOutput().validationReportStorageUrl()
                        );
                        return amqpMessage;
                    },
                    new FloorPlanGenerateCorrelationData(message.jobId().toString(), message)
            );
        } catch (RuntimeException e) {
            log.error(
                    "Floor-plan command 발행에 실패했습니다. projectId={}, jobId={}, jobStepId={}, correlationId={}, attemptNo={}, maxAttempts={}",
                    message.projectId(),
                    message.jobId(),
                    message.jobStepId(),
                    message.correlationId(),
                    message.attemptNo(),
                    message.maxAttempts(),
                    e
            );
            throw new CustomException(ErrorCode.FLOOR_PLAN_COMMAND_PUBLISH_FAILED);
        }
    }
}
