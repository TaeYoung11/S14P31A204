package com.a204.batang.domain.job.service;

import com.a204.batang.domain.floorplan.FloorPlanConstants;
import com.a204.batang.domain.ifcedit.IfcEditConstants;
import com.a204.batang.domain.job.dto.FloorPlanJobDetailsResponse;
import com.a204.batang.domain.job.dto.GetJobStatusResponse;
import com.a204.batang.domain.job.dto.IfcEditJobDetailsResponse;
import com.a204.batang.domain.job.dto.JobArtifactResponse;
import com.a204.batang.domain.job.dto.JobDetailsResponse;
import com.a204.batang.domain.job.dto.JobErrorResponse;
import com.a204.batang.domain.job.dto.JobOutputsResponse;
import com.a204.batang.domain.job.dto.JobStepResponse;
import com.a204.batang.domain.job.dto.RenderJobDetailsResponse;
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
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * 공통 단건 작업 상태 조회를 담당하는 읽기 전용 서비스다.
 *
 * <p>기존 ifcedit/render/floorplan의 write 흐름과 분리해
 * jobs/job_steps/artifacts 공통 테이블만 읽는 read model로 응답을 조합한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JobStatusQueryService {

    private static final String JOB_DOMAIN_IFC_EDIT = "IFC_EDIT";
    private static final String JOB_DOMAIN_RENDER = "RENDER";
    private static final String JOB_DOMAIN_FLOOR_PLAN = "FLOOR_PLAN";
    private static final String JOB_DOMAIN_UNKNOWN = "UNKNOWN";

    private static final String JOB_TYPE_SD_RENDER = "SD_RENDER";
    private static final String RENDER_ARTIFACT_TYPE = "RENDER_IMAGE";
    private static final String KST_ZONE_ID = "Asia/Seoul";
    private static final ZoneId KOREA_ZONE_ID = ZoneId.of(KST_ZONE_ID);

    private final JobRecordRepository jobRecordRepository;
    private final JobStepRecordRepository jobStepRecordRepository;
    private final JobArtifactRecordRepository jobArtifactRecordRepository;
    private final ProjectRepository projectRepository;
    private final ProjectAccessService projectAccessService;

    /**
     * 공통 jobId 기준으로 단건 작업 상태를 조회한다.
     */
    public GetJobStatusResponse getJobStatus(UUID jobId) {
        JobRecord job = jobRecordRepository.findByJobId(jobId)
                .orElseThrow(() -> new CustomException(ErrorCode.JOB_NOT_FOUND));

        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(job.getProjectId())
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        UUID currentUserId = projectAccessService.resolveCurrentUserIdOrThrow();
        projectAccessService.validateProjectMemberOrThrow(project, currentUserId);

        List<JobStepRecord> steps = jobStepRecordRepository.findByJobIdOrderByStepNoAsc(jobId);
        List<JobArtifactRecord> artifacts = jobArtifactRecordRepository.findByJobIdOrderByCreatedAtAscArtifactIdAsc(jobId);

        String jobDomain = resolveJobDomain(job.getJobType());
        JobStepRecord currentStepRecord = resolveCurrentStep(steps);
        JobStepRecord lastStepRecord = steps.isEmpty() ? null : steps.get(steps.size() - 1);

        List<JobStepResponse> stepResponses = steps.stream()
                .map(this::toStepResponse)
                .toList();
        JobStepResponse currentStep = currentStepRecord != null ? toStepResponse(currentStepRecord) : null;
        JobOutputsResponse outputs = buildOutputs(jobDomain, artifacts, lastStepRecord);
        JobDetailsResponse details = buildDetails(job, jobDomain, steps, artifacts, outputs);
        JobErrorResponse error = buildTopLevelError(job, currentStepRecord, lastStepRecord);

        return new GetJobStatusResponse(
                job.getJobId(),
                job.getProjectId(),
                jobDomain,
                normalizeUpper(job.getJobType()),
                normalizeUpper(job.getStatus()),
                job.getProgress(),
                job.isTerminal(),
                toUtcIso(job.getCreatedAt()),
                toUtcIso(job.getStartedAt()),
                toUtcIso(job.getFinishedAt()),
                error,
                currentStep,
                stepResponses,
                outputs,
                details
        );
    }

    private String resolveJobDomain(String jobType) {
        if (IfcEditConstants.JOB_TYPE_IFC_EDIT.equals(jobType)
                || IfcEditConstants.JOB_TYPE_TWO_D_TO_IFC_EDIT.equals(jobType)
                || IfcEditConstants.JOB_TYPE_THREE_D_TO_IFC_EDIT.equals(jobType)) {
            return JOB_DOMAIN_IFC_EDIT;
        }
        if (JOB_TYPE_SD_RENDER.equals(jobType)) {
            return JOB_DOMAIN_RENDER;
        }
        if (FloorPlanConstants.JOB_TYPE_IFC_GENERATE_FROM_BUBBLE.equals(jobType)) {
            return JOB_DOMAIN_FLOOR_PLAN;
        }
        return JOB_DOMAIN_UNKNOWN;
    }

    /**
     * 현재 단계는 비종료 step 중 step 번호가 가장 큰 것을 우선으로 선택한다.
     *
     * <p>모든 step이 종료된 경우에는 마지막 step을 현재 단계 요약으로 사용한다.
     */
    private JobStepRecord resolveCurrentStep(List<JobStepRecord> steps) {
        return steps.stream()
                .filter(step -> !step.isTerminal())
                .max(Comparator.comparing(JobStepRecord::getStepNo))
                .orElseGet(() -> steps.isEmpty() ? null : steps.get(steps.size() - 1));
    }

    private JobStepResponse toStepResponse(JobStepRecord step) {
        return new JobStepResponse(
                step.getJobStepId(),
                step.getStepNo(),
                normalizeUpper(step.getWorkerType()),
                normalizeUpper(step.getStatus()),
                step.getProgress(),
                step.getAttemptCount(),
                toUtcIso(step.getCreatedAt()),
                toUtcIso(step.getStartedAt()),
                toUtcIso(step.getFinishedAt()),
                buildStepError(step)
        );
    }

    private JobErrorResponse buildStepError(JobStepRecord step) {
        String errorCode = firstNonBlank(
                step.getErrorCode(),
                extractText(step.getOutputPayload(), "errorCode", "error_code")
        );
        String errorMessage = firstNonBlank(
                step.getErrorMessage(),
                extractText(step.getOutputPayload(), "errorMessage", "error_message")
        );
        Boolean retryable = extractBoolean(step.getOutputPayload(), "retryable");
        Boolean clarificationPossible = extractBoolean(step.getOutputPayload(), "clarificationPossible", "clarification_possible");
        String detailStorageUrl = extractText(step.getOutputPayload(), "detailStorageUrl", "detail_storage_url");

        if (errorCode == null && errorMessage == null && retryable == null
                && clarificationPossible == null && detailStorageUrl == null) {
            return null;
        }
        return new JobErrorResponse(errorCode, errorMessage, retryable, clarificationPossible, detailStorageUrl);
    }

    private JobErrorResponse buildTopLevelError(JobRecord job, JobStepRecord currentStep, JobStepRecord lastStep) {
        JobErrorResponse currentStepError = currentStep != null ? buildStepError(currentStep) : null;
        if (currentStepError != null) {
            return currentStepError;
        }

        JobErrorResponse lastStepError = lastStep != null ? buildStepError(lastStep) : null;
        if (lastStepError != null) {
            return lastStepError;
        }

        String errorMessage = firstNonBlank(
                job.getErrorMessage(),
                extractText(job.getResultPayload(), "errorMessage", "error_message")
        );
        String errorCode = extractText(job.getResultPayload(), "errorCode", "error_code");
        Boolean retryable = extractBoolean(job.getResultPayload(), "retryable");
        Boolean clarificationPossible = extractBoolean(job.getResultPayload(), "clarificationPossible", "clarification_possible");
        String detailStorageUrl = extractText(job.getResultPayload(), "detailStorageUrl", "detail_storage_url");

        if (errorCode == null && errorMessage == null && retryable == null
                && clarificationPossible == null && detailStorageUrl == null) {
            return null;
        }
        return new JobErrorResponse(errorCode, errorMessage, retryable, clarificationPossible, detailStorageUrl);
    }

    private JobOutputsResponse buildOutputs(String jobDomain, List<JobArtifactRecord> artifacts, JobStepRecord lastStep) {
        List<JobArtifactResponse> artifactResponses = artifacts.stream()
                .map(this::toArtifactResponse)
                .toList();

        JobArtifactRecord primaryArtifact = resolvePrimaryArtifact(jobDomain, artifacts);
        UUID targetRevisionId = primaryArtifact != null && primaryArtifact.getRevisionId() != null
                ? primaryArtifact.getRevisionId()
                : extractUuid(lastStep != null ? lastStep.getInputPayload() : null, "targetRevisionId", "target_revision_id");

        return new JobOutputsResponse(
                targetRevisionId,
                primaryArtifact != null ? primaryArtifact.getArtifactId() : null,
                primaryArtifact != null ? primaryArtifact.getStorageUrl() : null,
                artifactResponses
        );
    }

    private JobArtifactRecord resolvePrimaryArtifact(String jobDomain, List<JobArtifactRecord> artifacts) {
        String primaryArtifactType = switch (jobDomain) {
            case JOB_DOMAIN_IFC_EDIT, JOB_DOMAIN_FLOOR_PLAN -> IfcEditConstants.ARTIFACT_TYPE_IFC_MODEL;
            case JOB_DOMAIN_RENDER -> RENDER_ARTIFACT_TYPE;
            default -> null;
        };

        if (primaryArtifactType == null) {
            return artifacts.isEmpty() ? null : artifacts.get(0);
        }

        return artifacts.stream()
                .filter(artifact -> primaryArtifactType.equals(artifact.getArtifactType()))
                .findFirst()
                .orElseGet(() -> artifacts.isEmpty() ? null : artifacts.get(0));
    }

    private JobArtifactResponse toArtifactResponse(JobArtifactRecord artifact) {
        return new JobArtifactResponse(
                artifact.getArtifactId(),
                normalizeUpper(artifact.getArtifactType()),
                artifact.getRevisionId(),
                artifact.getFileName(),
                artifact.getMimeType(),
                artifact.getStorageUrl(),
                toUtcIso(artifact.getCreatedAt())
        );
    }

    private JobDetailsResponse buildDetails(
            JobRecord job,
            String jobDomain,
            List<JobStepRecord> steps,
            List<JobArtifactRecord> artifacts,
            JobOutputsResponse outputs
    ) {
        JobStepRecord lastStep = steps.isEmpty() ? null : steps.get(steps.size() - 1);

        return switch (jobDomain) {
            case JOB_DOMAIN_IFC_EDIT -> new JobDetailsResponse(
                    buildIfcEditDetails(job, lastStep, artifacts, outputs),
                    null,
                    null
            );
            case JOB_DOMAIN_RENDER -> new JobDetailsResponse(
                    null,
                    buildRenderDetails(job, lastStep),
                    null
            );
            case JOB_DOMAIN_FLOOR_PLAN -> new JobDetailsResponse(
                    null,
                    null,
                    buildFloorPlanDetails(job, lastStep, outputs)
            );
            default -> new JobDetailsResponse(null, null, null);
        };
    }

    private IfcEditJobDetailsResponse buildIfcEditDetails(
            JobRecord job,
            JobStepRecord lastStep,
            List<JobArtifactRecord> artifacts,
            JobOutputsResponse outputs
    ) {
        UUID validationReportArtifactId = findArtifactIdByType(artifacts, IfcEditConstants.ARTIFACT_TYPE_VALIDATION_REPORT);
        UUID editPlanArtifactId = findArtifactIdByType(artifacts, IfcEditConstants.ARTIFACT_TYPE_EDIT_PLAN);
        UUID expectedOutputArtifactId = extractUuid(
                lastStep != null ? lastStep.getInputPayload() : null,
                "expectedOutputArtifactId",
                "expected_output_artifact_id"
        );

        return new IfcEditJobDetailsResponse(
                resolveIfcEditMode(job.getJobType()),
                job.getSourceRevisionId(),
                job.getSourceSceneStateId(),
                normalizeUpper(job.getSourceSceneType()),
                outputs.targetRevisionId(),
                expectedOutputArtifactId,
                extractText(job.getRequestPayload(), "userInstruction", "user_instruction", "message"),
                validationReportArtifactId,
                editPlanArtifactId
        );
    }

    private String resolveIfcEditMode(String jobType) {
        return switch (jobType) {
            case IfcEditConstants.JOB_TYPE_IFC_EDIT -> "DIRECT";
            case IfcEditConstants.JOB_TYPE_TWO_D_TO_IFC_EDIT -> "TWO_D_LLM";
            case IfcEditConstants.JOB_TYPE_THREE_D_TO_IFC_EDIT -> "THREE_D_LLM";
            default -> null;
        };
    }

    private RenderJobDetailsResponse buildRenderDetails(JobRecord job, JobStepRecord lastStep) {
        JsonNode requestPayload = job.getRequestPayload();
        return new RenderJobDetailsResponse(
                job.getSourceRevisionId(),
                normalizeUpper(job.getSourceSceneType()),
                extractUuid(lastStep != null ? lastStep.getInputPayload() : null, "expectedOutputArtifactId", "expected_output_artifact_id"),
                extractText(requestPayload, "prompt"),
                extractText(requestPayload, "negativePrompt", "negative_prompt"),
                extractNode(requestPayload, "style"),
                extractInteger(requestPayload, "width"),
                extractInteger(requestPayload, "height"),
                extractText(requestPayload, "sourceImageStorageUrl", "source_image_storage_url")
        );
    }

    private FloorPlanJobDetailsResponse buildFloorPlanDetails(
            JobRecord job,
            JobStepRecord lastStep,
            JobOutputsResponse outputs
    ) {
        JsonNode inputPayload = lastStep != null ? lastStep.getInputPayload() : null;
        return new FloorPlanJobDetailsResponse(
                extractText(inputPayload, "inputSource", "input_source"),
                normalizeUpper(firstNonBlank(job.getSourceSceneType(), extractText(inputPayload, "sourceSceneType", "source_scene_type"))),
                outputs.targetRevisionId(),
                extractUuid(inputPayload, "expectedOutputArtifactId", "expected_output_artifact_id"),
                extractText(inputPayload, "layoutImportSchemaVersion", "layout_import_schema_version"),
                extractInteger(inputPayload, "revisionNo", "revision_no")
        );
    }

    private UUID findArtifactIdByType(List<JobArtifactRecord> artifacts, String artifactType) {
        return artifacts.stream()
                .filter(artifact -> artifactType.equals(artifact.getArtifactType()))
                .map(JobArtifactRecord::getArtifactId)
                .findFirst()
                .orElse(null);
    }

    /**
     * DB 컬럼은 TIMESTAMP WITHOUT TIME ZONE 전제를 사용하고,
     * 현재 운영 기준 시각은 KST(Asia/Seoul)로 해석한 뒤 UTC ISO-8601 문자열로 변환한다.
     */
    private String toUtcIso(LocalDateTime value) {
        if (value == null) {
            return null;
        }

        return value.atZone(KOREA_ZONE_ID)
                .withZoneSameInstant(ZoneOffset.UTC)
                .format(DateTimeFormatter.ISO_INSTANT);
    }

    private String normalizeUpper(String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim();
        if (normalized.isEmpty()) {
            return null;
        }
        return normalized.toUpperCase(Locale.ROOT);
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }

        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private String extractText(JsonNode node, String... fieldNames) {
        JsonNode value = extractNode(node, fieldNames);
        if (value == null) {
            return null;
        }

        String text = value.asText(null);
        return text == null || text.isBlank() ? null : text;
    }

    private Integer extractInteger(JsonNode node, String... fieldNames) {
        JsonNode value = extractNode(node, fieldNames);
        if (value == null) {
            return null;
        }
        if (value.isNumber()) {
            return value.intValue();
        }

        try {
            return Integer.parseInt(value.asText());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private Boolean extractBoolean(JsonNode node, String... fieldNames) {
        JsonNode value = extractNode(node, fieldNames);
        if (value == null) {
            return null;
        }
        if (value.isBoolean()) {
            return value.booleanValue();
        }

        String text = value.asText(null);
        if (text == null || text.isBlank()) {
            return null;
        }
        return Boolean.parseBoolean(text);
    }

    private UUID extractUuid(JsonNode node, String... fieldNames) {
        String text = extractText(node, fieldNames);
        if (text == null) {
            return null;
        }

        try {
            return UUID.fromString(text);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private JsonNode extractNode(JsonNode node, String... fieldNames) {
        if (node == null || fieldNames == null) {
            return null;
        }

        for (String fieldName : fieldNames) {
            JsonNode candidate = node.get(fieldName);
            if (candidate != null && !candidate.isNull() && !candidate.isMissingNode()) {
                return candidate;
            }
        }
        return null;
    }
}
