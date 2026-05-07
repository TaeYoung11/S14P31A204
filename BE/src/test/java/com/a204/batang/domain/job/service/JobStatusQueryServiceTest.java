package com.a204.batang.domain.job.service;

import com.a204.batang.domain.job.dto.GetJobStatusResponse;
import com.a204.batang.domain.job.dto.JobArtifactResponse;
import com.a204.batang.domain.job.entity.JobArtifactRecord;
import com.a204.batang.domain.job.entity.JobRecord;
import com.a204.batang.domain.job.entity.JobStepRecord;
import com.a204.batang.domain.job.repository.JobArtifactRecordRepository;
import com.a204.batang.domain.job.repository.JobRecordRepository;
import com.a204.batang.domain.job.repository.JobStepRecordRepository;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.lang.reflect.Constructor;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doThrow;

@ExtendWith(MockitoExtension.class)
class JobStatusQueryServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private JobRecordRepository jobRecordRepository;

    @Mock
    private JobStepRecordRepository jobStepRecordRepository;

    @Mock
    private JobArtifactRecordRepository jobArtifactRecordRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectAccessService projectAccessService;

    @InjectMocks
    private JobStatusQueryService jobStatusQueryService;

    private UUID jobId;
    private UUID projectId;
    private UUID currentUserId;
    private Project project;

    @BeforeEach
    void setUp() {
        jobId = UUID.randomUUID();
        projectId = UUID.randomUUID();
        currentUserId = UUID.randomUUID();
        project = Project.create("job-project", "desc", currentUserId);
        ReflectionTestUtils.setField(project, "projectId", projectId);
    }

    @Test
    void getJobStatus_throwsWhenJobDoesNotExist() {
        given(jobRecordRepository.findByJobId(jobId)).willReturn(Optional.empty());

        assertThatThrownBy(() -> jobStatusQueryService.getJobStatus(jobId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.JOB_NOT_FOUND);
    }

    @Test
    void getJobStatus_propagatesForbiddenAccess() throws Exception {
        JobRecord job = createJobRecord(jobId, projectId, "SD_RENDER", "QUEUED", 0, null, null, null, null);

        given(jobRecordRepository.findByJobId(jobId)).willReturn(Optional.of(job));
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(currentUserId);
        doThrow(new CustomException(ErrorCode.FORBIDDEN_ACCESS))
                .when(projectAccessService)
                .validateProjectMemberOrThrow(project, currentUserId);

        assertThatThrownBy(() -> jobStatusQueryService.getJobStatus(jobId))
                .isInstanceOf(CustomException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FORBIDDEN_ACCESS);
    }

    @Test
    void getJobStatus_returnsIfcEditDirectSuccess() throws Exception {
        UUID sourceRevisionId = UUID.randomUUID();
        UUID sourceSceneStateId = UUID.randomUUID();
        UUID targetRevisionId = UUID.randomUUID();
        UUID expectedArtifactId = UUID.randomUUID();
        UUID validationArtifactId = UUID.randomUUID();

        JobRecord job = createJobRecord(
                jobId,
                projectId,
                "IFC_EDIT",
                "SUCCEEDED",
                100,
                sourceRevisionId,
                sourceSceneStateId,
                "IFC_MODEL",
                objectNode()
        );
        ReflectionTestUtils.setField(job, "createdAt", LocalDateTime.of(2026, 5, 7, 10, 0));
        ReflectionTestUtils.setField(job, "startedAt", LocalDateTime.of(2026, 5, 7, 10, 1));
        ReflectionTestUtils.setField(job, "finishedAt", LocalDateTime.of(2026, 5, 7, 10, 5));

        ObjectNode stepInput = objectNode();
        stepInput.put("sourceRevisionId", sourceRevisionId.toString());
        stepInput.put("targetRevisionId", targetRevisionId.toString());
        stepInput.put("expectedOutputArtifactId", expectedArtifactId.toString());
        stepInput.put("sourceIfcStorageUrl", "s3://source.ifc");
        stepInput.put("ifcStorageUrl", "s3://target.ifc");

        JobStepRecord step = createStepRecord(UUID.randomUUID(), jobId, 1, "IFC_EDIT_APPLY", "SUCCEEDED", 100, 0, stepInput, null, null, null);
        ReflectionTestUtils.setField(step, "createdAt", LocalDateTime.of(2026, 5, 7, 10, 0));
        ReflectionTestUtils.setField(step, "startedAt", LocalDateTime.of(2026, 5, 7, 10, 1));
        ReflectionTestUtils.setField(step, "finishedAt", LocalDateTime.of(2026, 5, 7, 10, 5));

        JobArtifactRecord ifcArtifact = createArtifactRecord(expectedArtifactId, projectId, targetRevisionId, jobId, "IFC_MODEL", "model.ifc", "application/x-step", "s3://batang/result.ifc");
        JobArtifactRecord validationArtifact = createArtifactRecord(validationArtifactId, projectId, targetRevisionId, jobId, "VALIDATION_REPORT", "validation.json", "application/json", "s3://batang/validation.json");

        prepareProjectAccess(job);
        given(jobStepRecordRepository.findByJobIdOrderByStepNoAsc(jobId)).willReturn(List.of(step));
        given(jobArtifactRecordRepository.findByJobIdOrderByCreatedAtAscArtifactIdAsc(jobId)).willReturn(List.of(ifcArtifact, validationArtifact));

        GetJobStatusResponse response = jobStatusQueryService.getJobStatus(jobId);

        assertThat(response.jobDomain()).isEqualTo("IFC_EDIT");
        assertThat(response.jobType()).isEqualTo("IFC_EDIT");
        assertThat(response.status()).isEqualTo("SUCCEEDED");
        assertThat(response.terminal()).isTrue();
        assertThat(response.outputs().targetRevisionId()).isEqualTo(targetRevisionId);
        assertThat(response.outputs().primaryArtifactId()).isEqualTo(expectedArtifactId);
        assertThat(response.outputs().primaryResultUrl()).isEqualTo("s3://batang/result.ifc");
        assertThat(response.outputs().artifacts()).hasSize(2)
                .extracting(JobArtifactResponse::artifactType)
                .containsExactly("IFC_MODEL", "VALIDATION_REPORT");
        assertThat(response.details().ifcEdit()).isNotNull();
        assertThat(response.details().ifcEdit().mode()).isEqualTo("DIRECT");
        assertThat(response.details().ifcEdit().sourceRevisionId()).isEqualTo(sourceRevisionId);
        assertThat(response.details().ifcEdit().sourceSceneStateId()).isEqualTo(sourceSceneStateId);
        assertThat(response.details().ifcEdit().targetRevisionId()).isEqualTo(targetRevisionId);
        assertThat(response.details().ifcEdit().expectedOutputArtifactId()).isEqualTo(expectedArtifactId);
        assertThat(response.details().ifcEdit().validationReportArtifactId()).isEqualTo(validationArtifactId);
        assertThat(response.currentStep()).isNotNull();
        assertThat(response.currentStep().stepNo()).isEqualTo(1);
    }

    @Test
    void getJobStatus_returnsIfcEditRunningWithSecondStepAsCurrentStep() throws Exception {
        UUID sourceRevisionId = UUID.randomUUID();
        UUID targetRevisionId = UUID.randomUUID();
        UUID expectedArtifactId = UUID.randomUUID();

        ObjectNode requestPayload = objectNode();
        requestPayload.put("user_instruction", "거실 벽을 추가해줘");
        JobRecord job = createJobRecord(
                jobId,
                projectId,
                "TWO_D_TO_IFC_EDIT",
                "RUNNING",
                50,
                sourceRevisionId,
                UUID.randomUUID(),
                "IFC_MODEL",
                requestPayload
        );

        ObjectNode step1Output = objectNode();
        step1Output.put("editPlanStorageUrl", "s3://batang/edit-plan.json");

        JobStepRecord step1 = createStepRecord(UUID.randomUUID(), jobId, 1, "TWO_D_LLM", "SUCCEEDED", 100, 0, objectNode(), step1Output, null, null);

        ObjectNode step2Input = objectNode();
        step2Input.put("sourceRevisionId", sourceRevisionId.toString());
        step2Input.put("targetRevisionId", targetRevisionId.toString());
        step2Input.put("expectedOutputArtifactId", expectedArtifactId.toString());
        step2Input.put("ifcStorageUrl", "s3://batang/future.ifc");
        JobStepRecord step2 = createStepRecord(UUID.randomUUID(), jobId, 2, "IFC_EDIT_APPLY", "QUEUED", 0, 0, step2Input, null, null, null);

        prepareProjectAccess(job);
        given(jobStepRecordRepository.findByJobIdOrderByStepNoAsc(jobId)).willReturn(List.of(step1, step2));
        given(jobArtifactRecordRepository.findByJobIdOrderByCreatedAtAscArtifactIdAsc(jobId)).willReturn(List.of());

        GetJobStatusResponse response = jobStatusQueryService.getJobStatus(jobId);

        assertThat(response.jobDomain()).isEqualTo("IFC_EDIT");
        assertThat(response.currentStep()).isNotNull();
        assertThat(response.currentStep().stepNo()).isEqualTo(2);
        assertThat(response.steps()).hasSize(2);
        assertThat(response.outputs().targetRevisionId()).isEqualTo(targetRevisionId);
        assertThat(response.outputs().primaryArtifactId()).isEqualTo(expectedArtifactId);
        assertThat(response.outputs().primaryResultUrl()).isNull();
        assertThat(response.details().ifcEdit().mode()).isEqualTo("TWO_D_LLM");
        assertThat(response.details().ifcEdit().userInstruction()).isEqualTo("거실 벽을 추가해줘");
    }

    @Test
    void getJobStatus_returnsRenderFailed() throws Exception {
        UUID expectedArtifactId = UUID.randomUUID();

        ObjectNode requestPayload = objectNode();
        requestPayload.put("prompt", "quiet library");
        requestPayload.put("negativePrompt", "rain");
        ObjectNode styleNode = requestPayload.putObject("style");
        styleNode.put("timeOfDay", "EVENING");
        requestPayload.put("width", 1024);
        requestPayload.put("height", 768);
        requestPayload.put("sourceImageStorageUrl", "s3://batang/reference.png");

        JobRecord job = createJobRecord(
                jobId,
                projectId,
                "SD_RENDER",
                "FAILED",
                0,
                UUID.randomUUID(),
                null,
                "IFC_MODEL",
                requestPayload
        );
        ReflectionTestUtils.setField(job, "errorMessage", "렌더링 실패");

        ObjectNode stepInput = objectNode();
        stepInput.put("expectedOutputArtifactId", expectedArtifactId.toString());
        ObjectNode stepOutput = objectNode();
        stepOutput.put("errorCode", "SD_RENDER_FAILED");
        stepOutput.put("errorMessage", "worker crashed");
        stepOutput.put("retryable", true);

        JobStepRecord step = createStepRecord(UUID.randomUUID(), jobId, 1, "SD_RENDER", "FAILED", 0, 1, stepInput, stepOutput, "SD_RENDER_FAILED", "worker crashed");

        prepareProjectAccess(job);
        given(jobStepRecordRepository.findByJobIdOrderByStepNoAsc(jobId)).willReturn(List.of(step));
        given(jobArtifactRecordRepository.findByJobIdOrderByCreatedAtAscArtifactIdAsc(jobId)).willReturn(List.of());

        GetJobStatusResponse response = jobStatusQueryService.getJobStatus(jobId);

        assertThat(response.jobDomain()).isEqualTo("RENDER");
        assertThat(response.error()).isNotNull();
        assertThat(response.error().code()).isEqualTo("SD_RENDER_FAILED");
        assertThat(response.error().message()).isEqualTo("worker crashed");
        assertThat(response.error().retryable()).isTrue();
        assertThat(response.details().render()).isNotNull();
        assertThat(response.details().render().expectedOutputArtifactId()).isEqualTo(expectedArtifactId);
        assertThat(response.details().render().prompt()).isEqualTo("quiet library");
        assertThat(response.details().render().negativePrompt()).isEqualTo("rain");
        assertThat(response.details().render().style()).isNotNull();
        assertThat(response.details().render().style().get("timeOfDay").asText()).isEqualTo("EVENING");
        assertThat(response.details().render().width()).isEqualTo(1024);
        assertThat(response.details().render().height()).isEqualTo(768);
        assertThat(response.outputs().primaryArtifactId()).isEqualTo(expectedArtifactId);
    }

    @Test
    void getJobStatus_returnsFloorPlanSuccess() throws Exception {
        UUID targetRevisionId = UUID.randomUUID();
        UUID expectedArtifactId = UUID.randomUUID();
        UUID validationArtifactId = UUID.randomUUID();

        JobRecord job = createJobRecord(
                jobId,
                projectId,
                "IFC_GENERATE_FROM_BUBBLE",
                "SUCCEEDED",
                100,
                null,
                null,
                "LAYOUT_IMPORT",
                objectNode()
        );

        ObjectNode stepInput = objectNode();
        stepInput.put("inputSource", "WORKSPACE_SNAPSHOT");
        stepInput.put("targetRevisionId", targetRevisionId.toString());
        stepInput.put("expectedOutputArtifactId", expectedArtifactId.toString());
        stepInput.put("layoutImportSchemaVersion", "v2");
        stepInput.put("revisionNo", 7);
        JobStepRecord step = createStepRecord(UUID.randomUUID(), jobId, 1, "IFC_GENERATE_FROM_BUBBLE", "SUCCEEDED", 100, 0, stepInput, null, null, null);

        JobArtifactRecord ifcArtifact = createArtifactRecord(expectedArtifactId, projectId, targetRevisionId, jobId, "IFC_MODEL", "model.v1.ifc", "application/octet-stream", "s3://batang/floorplan.ifc");
        JobArtifactRecord validationArtifact = createArtifactRecord(validationArtifactId, projectId, targetRevisionId, jobId, "VALIDATION_REPORT", "validation-report.json", "application/json", "s3://batang/floorplan-validation.json");

        prepareProjectAccess(job);
        given(jobStepRecordRepository.findByJobIdOrderByStepNoAsc(jobId)).willReturn(List.of(step));
        given(jobArtifactRecordRepository.findByJobIdOrderByCreatedAtAscArtifactIdAsc(jobId)).willReturn(List.of(ifcArtifact, validationArtifact));

        GetJobStatusResponse response = jobStatusQueryService.getJobStatus(jobId);

        assertThat(response.jobDomain()).isEqualTo("FLOOR_PLAN");
        assertThat(response.details().floorPlan()).isNotNull();
        assertThat(response.details().floorPlan().inputSource()).isEqualTo("WORKSPACE_SNAPSHOT");
        assertThat(response.details().floorPlan().sourceSceneType()).isEqualTo("LAYOUT_IMPORT");
        assertThat(response.details().floorPlan().targetRevisionId()).isEqualTo(targetRevisionId);
        assertThat(response.details().floorPlan().expectedOutputArtifactId()).isEqualTo(expectedArtifactId);
        assertThat(response.details().floorPlan().layoutImportSchemaVersion()).isEqualTo("v2");
        assertThat(response.details().floorPlan().revisionNo()).isEqualTo(7);
        assertThat(response.outputs().primaryArtifactId()).isEqualTo(expectedArtifactId);
        assertThat(response.outputs().artifacts()).hasSize(2);
    }

    @Test
    void getJobStatus_returnsUnknownDomainAndEmptySteps() throws Exception {
        JobRecord job = createJobRecord(
                jobId,
                projectId,
                "SOMETHING_NEW",
                "QUEUED",
                0,
                null,
                null,
                null,
                objectNode()
        );

        prepareProjectAccess(job);
        given(jobStepRecordRepository.findByJobIdOrderByStepNoAsc(jobId)).willReturn(List.of());
        given(jobArtifactRecordRepository.findByJobIdOrderByCreatedAtAscArtifactIdAsc(jobId)).willReturn(List.of());

        GetJobStatusResponse response = jobStatusQueryService.getJobStatus(jobId);

        assertThat(response.jobDomain()).isEqualTo("UNKNOWN");
        assertThat(response.currentStep()).isNull();
        assertThat(response.steps()).isEmpty();
        assertThat(response.details().ifcEdit()).isNull();
        assertThat(response.details().render()).isNull();
        assertThat(response.details().floorPlan()).isNull();
    }

    private void prepareProjectAccess(JobRecord job) {
        given(jobRecordRepository.findByJobId(jobId)).willReturn(Optional.of(job));
        given(projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)).willReturn(Optional.of(project));
        given(projectAccessService.resolveCurrentUserIdOrThrow()).willReturn(currentUserId);
    }

    private JobRecord createJobRecord(
            UUID jobId,
            UUID projectId,
            String jobType,
            String status,
            Integer progress,
            UUID sourceRevisionId,
            UUID sourceSceneStateId,
            String sourceSceneType,
            ObjectNode requestPayload
    ) throws Exception {
        Constructor<JobRecord> constructor = JobRecord.class.getDeclaredConstructor();
        constructor.setAccessible(true);
        JobRecord record = constructor.newInstance();
        ReflectionTestUtils.setField(record, "jobId", jobId);
        ReflectionTestUtils.setField(record, "projectId", projectId);
        ReflectionTestUtils.setField(record, "jobType", jobType);
        ReflectionTestUtils.setField(record, "status", status);
        ReflectionTestUtils.setField(record, "progress", progress);
        ReflectionTestUtils.setField(record, "sourceRevisionId", sourceRevisionId);
        ReflectionTestUtils.setField(record, "sourceSceneStateId", sourceSceneStateId);
        ReflectionTestUtils.setField(record, "sourceSceneType", sourceSceneType);
        ReflectionTestUtils.setField(record, "requestPayload", requestPayload);
        ReflectionTestUtils.setField(record, "createdAt", LocalDateTime.of(2026, 5, 7, 10, 0));
        return record;
    }

    private JobStepRecord createStepRecord(
            UUID jobStepId,
            UUID jobId,
            Integer stepNo,
            String workerType,
            String status,
            Integer progress,
            Integer attemptCount,
            ObjectNode inputPayload,
            ObjectNode outputPayload,
            String errorCode,
            String errorMessage
    ) throws Exception {
        Constructor<JobStepRecord> constructor = JobStepRecord.class.getDeclaredConstructor();
        constructor.setAccessible(true);
        JobStepRecord record = constructor.newInstance();
        ReflectionTestUtils.setField(record, "jobStepId", jobStepId);
        ReflectionTestUtils.setField(record, "jobId", jobId);
        ReflectionTestUtils.setField(record, "stepNo", stepNo);
        ReflectionTestUtils.setField(record, "workerType", workerType);
        ReflectionTestUtils.setField(record, "status", status);
        ReflectionTestUtils.setField(record, "progress", progress);
        ReflectionTestUtils.setField(record, "attemptCount", attemptCount);
        ReflectionTestUtils.setField(record, "inputPayload", inputPayload);
        ReflectionTestUtils.setField(record, "outputPayload", outputPayload);
        ReflectionTestUtils.setField(record, "errorCode", errorCode);
        ReflectionTestUtils.setField(record, "errorMessage", errorMessage);
        ReflectionTestUtils.setField(record, "createdAt", LocalDateTime.of(2026, 5, 7, 10, 0));
        return record;
    }

    private JobArtifactRecord createArtifactRecord(
            UUID artifactId,
            UUID projectId,
            UUID revisionId,
            UUID jobId,
            String artifactType,
            String fileName,
            String mimeType,
            String storageUrl
    ) throws Exception {
        Constructor<JobArtifactRecord> constructor = JobArtifactRecord.class.getDeclaredConstructor();
        constructor.setAccessible(true);
        JobArtifactRecord record = constructor.newInstance();
        ReflectionTestUtils.setField(record, "artifactId", artifactId);
        ReflectionTestUtils.setField(record, "projectId", projectId);
        ReflectionTestUtils.setField(record, "revisionId", revisionId);
        ReflectionTestUtils.setField(record, "jobId", jobId);
        ReflectionTestUtils.setField(record, "artifactType", artifactType);
        ReflectionTestUtils.setField(record, "fileName", fileName);
        ReflectionTestUtils.setField(record, "mimeType", mimeType);
        ReflectionTestUtils.setField(record, "storageUrl", storageUrl);
        ReflectionTestUtils.setField(record, "createdAt", LocalDateTime.of(2026, 5, 7, 10, 5));
        return record;
    }

    private ObjectNode objectNode() {
        return objectMapper.createObjectNode();
    }
}
