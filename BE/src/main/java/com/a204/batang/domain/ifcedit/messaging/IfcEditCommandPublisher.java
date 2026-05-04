package com.a204.batang.domain.ifcedit.messaging;

import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditCommandMessage;
import com.a204.batang.global.config.RabbitMqConfig;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class IfcEditCommandPublisher {

    public static final String HEADER_MESSAGE_ID = "x-ifc-edit-message-id";
    public static final String HEADER_SCHEMA_VERSION = "x-ifc-edit-schema-version";
    public static final String HEADER_MESSAGE_TYPE = "x-ifc-edit-message-type";
    public static final String HEADER_COMMAND_TYPE = "x-ifc-edit-command-type";
    public static final String HEADER_ROUTING_KEY = "x-ifc-edit-routing-key";
    public static final String HEADER_JOB_ID = "x-ifc-edit-job-id";
    public static final String HEADER_JOB_STEP_ID = "x-ifc-edit-job-step-id";
    public static final String HEADER_STEP_NO = "x-ifc-edit-step-no";
    public static final String HEADER_TOTAL_STEPS = "x-ifc-edit-total-steps";
    public static final String HEADER_PROJECT_ID = "x-ifc-edit-project-id";
    public static final String HEADER_REQUESTED_BY = "x-ifc-edit-requested-by";
    public static final String HEADER_SOURCE_REVISION_ID = "x-ifc-edit-source-revision-id";
    public static final String HEADER_SOURCE_SCENE_STATE_ID = "x-ifc-edit-source-scene-state-id";
    public static final String HEADER_SOURCE_SCENE_TYPE = "x-ifc-edit-source-scene-type";
    public static final String HEADER_TARGET_REVISION_ID = "x-ifc-edit-target-revision-id";
    public static final String HEADER_EXPECTED_OUTPUT_ARTIFACT_ID = "x-ifc-edit-expected-output-artifact-id";
    public static final String HEADER_ATTEMPT_NO = "x-ifc-edit-attempt-no";
    public static final String HEADER_MAX_ATTEMPTS = "x-ifc-edit-max-attempts";
    public static final String HEADER_IDEMPOTENCY_KEY = "x-ifc-edit-idempotency-key";
    public static final String HEADER_CORRELATION_ID = "x-ifc-edit-correlation-id";
    public static final String HEADER_CREATED_AT = "x-ifc-edit-created-at";
    public static final String HEADER_IFC_STORAGE_URL = "x-ifc-edit-ifc-storage-url";
    public static final String HEADER_VALIDATION_REPORT_STORAGE_URL = "x-ifc-edit-validation-report-storage-url";
    public static final String HEADER_EDIT_PLAN_STORAGE_URL = "x-ifc-edit-edit-plan-storage-url";

    private final RabbitTemplate rabbitTemplate;

    public void publish(IfcEditCommandMessage message) {
        try {
            log.info(
                    "IFC Edit command 발행을 시도합니다. projectId={}, jobId={}, jobStepId={}, routingKey={}, correlationId={}, attemptNo={}, maxAttempts={}",
                    message.projectId(),
                    message.jobId(),
                    message.jobStepId(),
                    message.routingKey(),
                    message.correlationId(),
                    message.attemptNo(),
                    message.maxAttempts()
            );

            rabbitTemplate.convertAndSend(
                    RabbitMqConfig.COMMAND_EXCHANGE,
                    message.routingKey(),
                    message,
                    amqpMessage -> {
                        var props = amqpMessage.getMessageProperties();
                        props.setHeader(HEADER_MESSAGE_ID, message.messageId().toString());
                        props.setHeader(HEADER_SCHEMA_VERSION, message.schemaVersion());
                        props.setHeader(HEADER_MESSAGE_TYPE, message.messageType());
                        props.setHeader(HEADER_COMMAND_TYPE, message.commandType());
                        props.setHeader(HEADER_ROUTING_KEY, message.routingKey());
                        props.setHeader(HEADER_JOB_ID, message.jobId().toString());
                        props.setHeader(HEADER_JOB_STEP_ID, message.jobStepId().toString());
                        props.setHeader(HEADER_STEP_NO, message.stepNo());
                        props.setHeader(HEADER_TOTAL_STEPS, message.totalSteps());
                        props.setHeader(HEADER_PROJECT_ID, message.projectId().toString());
                        if (message.requestedBy() != null) {
                            props.setHeader(HEADER_REQUESTED_BY, message.requestedBy().toString());
                        }
                        if (message.sourceRevisionId() != null) {
                            props.setHeader(HEADER_SOURCE_REVISION_ID, message.sourceRevisionId().toString());
                        }
                        if (message.sourceSceneStateId() != null) {
                            props.setHeader(HEADER_SOURCE_SCENE_STATE_ID, message.sourceSceneStateId().toString());
                        }
                        if (message.sourceSceneType() != null) {
                            props.setHeader(HEADER_SOURCE_SCENE_TYPE, message.sourceSceneType());
                        }
                        if (message.targetRevisionId() != null) {
                            props.setHeader(HEADER_TARGET_REVISION_ID, message.targetRevisionId().toString());
                        }
                        if (message.expectedOutputArtifactId() != null) {
                            props.setHeader(HEADER_EXPECTED_OUTPUT_ARTIFACT_ID, message.expectedOutputArtifactId().toString());
                        }
                        props.setHeader(HEADER_ATTEMPT_NO, message.attemptNo());
                        props.setHeader(HEADER_MAX_ATTEMPTS, message.maxAttempts());
                        props.setHeader(HEADER_IDEMPOTENCY_KEY, message.idempotencyKey());
                        props.setHeader(HEADER_CORRELATION_ID, message.correlationId().toString());
                        props.setHeader(HEADER_CREATED_AT, message.createdAt().toString());
                        if (message.expectedOutput() != null) {
                            if (message.expectedOutput().ifcStorageUrl() != null) {
                                props.setHeader(HEADER_IFC_STORAGE_URL, message.expectedOutput().ifcStorageUrl());
                            }
                            if (message.expectedOutput().validationReportStorageUrl() != null) {
                                props.setHeader(HEADER_VALIDATION_REPORT_STORAGE_URL, message.expectedOutput().validationReportStorageUrl());
                            }
                            if (message.expectedOutput().editPlanStorageUrl() != null) {
                                props.setHeader(HEADER_EDIT_PLAN_STORAGE_URL, message.expectedOutput().editPlanStorageUrl());
                            }
                        }
                        return amqpMessage;
                    },
                    new IfcEditCommandCorrelationData(message.jobId().toString(), message)
            );
        } catch (RuntimeException e) {
            log.error(
                    "IFC Edit command 발행에 실패했습니다. projectId={}, jobId={}, jobStepId={}, correlationId={}, attemptNo={}, maxAttempts={}",
                    message.projectId(),
                    message.jobId(),
                    message.jobStepId(),
                    message.correlationId(),
                    message.attemptNo(),
                    message.maxAttempts(),
                    e
            );
            throw new CustomException(ErrorCode.IFC_EDIT_COMMAND_PUBLISH_FAILED);
        }
    }
}
