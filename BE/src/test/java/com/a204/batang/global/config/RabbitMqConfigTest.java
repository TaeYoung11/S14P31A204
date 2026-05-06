package com.a204.batang.global.config;

import com.a204.batang.domain.ifcedit.messaging.IfcEditCommandPublisher;
import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditCommandMessage;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class RabbitMqConfigTest {

    private final RabbitMqConfig rabbitMqConfig = new RabbitMqConfig();

    @Test
    void reconstructIfcEditMessageFromHeaders_usesPublisherHeaderConstants() {
        UUID messageId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID requestedBy = UUID.randomUUID();
        UUID targetRevisionId = UUID.randomUUID();
        UUID artifactId = UUID.randomUUID();
        UUID correlationId = UUID.randomUUID();
        OffsetDateTime createdAt = OffsetDateTime.now();

        Map<String, Object> headers = new HashMap<>();
        headers.put(IfcEditCommandPublisher.HEADER_MESSAGE_ID, messageId.toString());
        headers.put(IfcEditCommandPublisher.HEADER_SCHEMA_VERSION, "v1");
        headers.put(IfcEditCommandPublisher.HEADER_MESSAGE_TYPE, "COMMAND");
        headers.put(IfcEditCommandPublisher.HEADER_COMMAND_TYPE, "IFC_EDIT_APPLY");
        headers.put(IfcEditCommandPublisher.HEADER_ROUTING_KEY, RabbitMqConfig.IFC_EDIT_COMMAND_ROUTING_KEY);
        headers.put(IfcEditCommandPublisher.HEADER_JOB_ID, jobId.toString());
        headers.put(IfcEditCommandPublisher.HEADER_JOB_STEP_ID, jobStepId.toString());
        headers.put(IfcEditCommandPublisher.HEADER_STEP_NO, 1);
        headers.put(IfcEditCommandPublisher.HEADER_TOTAL_STEPS, 1);
        headers.put(IfcEditCommandPublisher.HEADER_PROJECT_ID, projectId.toString());
        headers.put(IfcEditCommandPublisher.HEADER_REQUESTED_BY, requestedBy.toString());
        headers.put(IfcEditCommandPublisher.HEADER_SOURCE_SCENE_TYPE, "IFC_MODEL");
        headers.put(IfcEditCommandPublisher.HEADER_TARGET_REVISION_ID, targetRevisionId.toString());
        headers.put(IfcEditCommandPublisher.HEADER_EXPECTED_OUTPUT_ARTIFACT_ID, artifactId.toString());
        headers.put(IfcEditCommandPublisher.HEADER_IFC_STORAGE_URL, "projects/p/revisions/new/model.ifc");
        headers.put(IfcEditCommandPublisher.HEADER_ATTEMPT_NO, 1);
        headers.put(IfcEditCommandPublisher.HEADER_MAX_ATTEMPTS, 3);
        headers.put(IfcEditCommandPublisher.HEADER_IDEMPOTENCY_KEY, "idempotency-key");
        headers.put(IfcEditCommandPublisher.HEADER_CORRELATION_ID, correlationId.toString());
        headers.put(IfcEditCommandPublisher.HEADER_CREATED_AT, createdAt.toString());

        IfcEditCommandMessage message = ReflectionTestUtils.invokeMethod(
                rabbitMqConfig, "reconstructIfcEditMessageFromHeaders", headers
        );

        assertThat(message).isNotNull();
        assertThat(message.messageId()).isEqualTo(messageId);
        assertThat(message.jobId()).isEqualTo(jobId);
        assertThat(message.jobStepId()).isEqualTo(jobStepId);
        assertThat(message.projectId()).isEqualTo(projectId);
        assertThat(message.requestedBy()).isEqualTo(requestedBy);
        assertThat(message.targetRevisionId()).isEqualTo(targetRevisionId);
        assertThat(message.expectedOutputArtifactId()).isEqualTo(artifactId);
        assertThat(message.expectedOutput().ifcStorageUrl()).isEqualTo("projects/p/revisions/new/model.ifc");
        assertThat(message.expectedOutput().validationReportStorageUrl()).isNull();
        assertThat(message.expectedOutput().editPlanStorageUrl()).isNull();
        assertThat(message.correlationId()).isEqualTo(correlationId);
        assertThat(message.createdAt()).isEqualTo(createdAt);
    }
}
