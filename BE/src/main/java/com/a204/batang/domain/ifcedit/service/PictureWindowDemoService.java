package com.a204.batang.domain.ifcedit.service;

import com.a204.batang.domain.ifcedit.IfcEditConstants;
import com.a204.batang.domain.ifcedit.dto.ChatCommandRequest;
import com.a204.batang.domain.ifcedit.dto.IfcEditJobResponse;
import com.a204.batang.domain.ifcedit.entity.IfcEditArtifact;
import com.a204.batang.domain.ifcedit.entity.IfcEditJob;
import com.a204.batang.domain.ifcedit.entity.IfcEditJobStep;
import com.a204.batang.domain.ifcedit.repository.IfcEditArtifactRepository;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobRepository;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobStepRepository;
import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.revision.entity.Revision;
import com.a204.batang.domain.revision.repository.RevisionRepository;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CopyObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * 시연 전용 "거실 창문 통창" 채팅 핸들러.
 *
 * <p>LLM/Worker를 거치지 않고 미리 준비된 결과 IFC를 새 revision으로 복사해 즉시 SUCCEEDED 상태로
 * 종료시킨다. 층 정보가 명시되지 않은 경우 1F/2F clarification artifact를 MinIO에 업로드하고
 * job_step output_payload에 detailStorageUrl을 박아 FE의 AssistantClarificationCard가
 * 그대로 동작하도록 한다.
 *
 * <p>이 서비스는 시연 시나리오를 위한 임시 핸들러이며, 정식 worker 경로와 별개로 BE만으로 응답을
 * 완결한다.
 */
@Slf4j
@Service
public class PictureWindowDemoService {

    private static final String PREBAKE_KEY =
            "projects/0e329571-c47f-481c-abd7-a05fc34300a4/demo/picture-window/model.v1.ifc";
    private static final String TARGET_PROJECT_ID = "0e329571-c47f-481c-abd7-a05fc34300a4";

    private static final String PICTURE_WINDOW_KEYWORD = "통창";
    private static final List<String> FIRST_FLOOR_TOKENS =
            List.of("1층", "1F", "1f", "일층", "첫째층");
    private static final List<String> SECOND_FLOOR_TOKENS =
            List.of("2층", "2F", "2f", "이층", "둘째층");

    private final ProjectRepository projectRepository;
    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final RevisionRepository revisionRepository;
    private final ProjectAccessService projectAccessService;
    private final IfcEditJobRepository ifcEditJobRepository;
    private final IfcEditJobStepRepository ifcEditJobStepRepository;
    private final IfcEditArtifactRepository ifcEditArtifactRepository;
    private final IfcEditStoragePathBuilder pathBuilder;
    private final S3Client s3Client;
    private final ObjectMapper objectMapper;
    private final String bucket;

    public PictureWindowDemoService(
            ProjectRepository projectRepository,
            ProjectWorkspaceRepository projectWorkspaceRepository,
            RevisionRepository revisionRepository,
            ProjectAccessService projectAccessService,
            IfcEditJobRepository ifcEditJobRepository,
            IfcEditJobStepRepository ifcEditJobStepRepository,
            IfcEditArtifactRepository ifcEditArtifactRepository,
            IfcEditStoragePathBuilder pathBuilder,
            S3Client s3Client,
            ObjectMapper objectMapper,
            @Value("${app.aws.s3.bucket}") String bucket
    ) {
        this.projectRepository = projectRepository;
        this.projectWorkspaceRepository = projectWorkspaceRepository;
        this.revisionRepository = revisionRepository;
        this.projectAccessService = projectAccessService;
        this.ifcEditJobRepository = ifcEditJobRepository;
        this.ifcEditJobStepRepository = ifcEditJobStepRepository;
        this.ifcEditArtifactRepository = ifcEditArtifactRepository;
        this.pathBuilder = pathBuilder;
        this.s3Client = s3Client;
        this.objectMapper = objectMapper;
        this.bucket = bucket;
    }

    /**
     * 채팅 메시지가 통창 시나리오에 해당하면 처리하고 결과를 반환한다.
     * 매칭되지 않으면 {@code Optional.empty()}를 반환해 호출자가 기본 LLM 경로로 진행하도록 한다.
     */
    @Transactional
    public Optional<IfcEditJobResponse> tryHandle(UUID projectId, UUID userId, ChatCommandRequest request) {
        if (request == null || request.message() == null) {
            return Optional.empty();
        }
        String message = request.message().trim();
        if (!message.contains(PICTURE_WINDOW_KEYWORD)) {
            return Optional.empty();
        }
        if (!TARGET_PROJECT_ID.equalsIgnoreCase(projectId.toString())) {
            // 시연 전용 핸들러: 다른 프로젝트는 처리하지 않는다.
            return Optional.empty();
        }

        Project project = projectRepository.findByProjectIdAndDeletedAtIsNullForUpdate(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));
        UUID currentUserId = Optional.ofNullable(userId)
                .orElseGet(projectAccessService::resolveCurrentUserIdOrThrow);
        projectAccessService.validateProjectOwnerOrThrow(project, currentUserId);

        FloorIntent intent = resolveFloorIntent(message);
        log.info("PictureWindowDemo 핸들러 진입. projectId={}, intent={}, message={}",
                projectId, intent, message);

        return switch (intent) {
            case FIRST_FLOOR -> Optional.of(executePictureWindow(project, currentUserId, request));
            case SECOND_FLOOR -> Optional.of(rejectSecondFloor(project, currentUserId, request));
            case AMBIGUOUS -> Optional.of(askClarification(project, currentUserId, request));
        };
    }

    private FloorIntent resolveFloorIntent(String message) {
        boolean first = FIRST_FLOOR_TOKENS.stream().anyMatch(message::contains);
        boolean second = SECOND_FLOOR_TOKENS.stream().anyMatch(message::contains);
        if (first && !second) return FloorIntent.FIRST_FLOOR;
        if (second && !first) return FloorIntent.SECOND_FLOOR;
        return FloorIntent.AMBIGUOUS;
    }

    private IfcEditJobResponse askClarification(Project project, UUID currentUserId, ChatCommandRequest request) {
        UUID projectId = project.getProjectId();
        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();

        String detailKey = String.format(
                "projects/%s/jobs/%s/steps/001/clarification/detail.v1.json",
                projectId, jobId
        );
        String detailStorageUrl = "s3://" + bucket + "/" + detailKey;

        Map<String, Object> detailJson = new LinkedHashMap<>();
        detailJson.put("schema_version", "v1");
        detailJson.put("kind", "alternatives");
        detailJson.put("question", "어느 층 거실의 창문을 통창으로 바꿀까요?");
        detailJson.put("alternatives", List.of(
                Map.of(
                        "alternative_id", "picture_window-1f",
                        "title", "1층 거실 창문 통창으로 바꿔줘",
                        "description", "1층 거실 서쪽 외벽의 창 2개를 합쳐 큰 통창 하나로 만듭니다.",
                        "fill", Map.of("target_floor", 1, "target_room_name", "거실"),
                        "affected_entities", List.of(
                                "2znubWhPDD4wn7Fg4E25XL",
                                "2znubWhPDD4wn7Fg4E25$b"
                        ),
                        "warnings", List.of(),
                        "metrics", List.of()
                ),
                Map.of(
                        "alternative_id", "picture_window-2f",
                        "title", "2층 거실 창문 통창으로 바꿔줘",
                        "description", "2층 거실의 외벽 창문을 통창으로 바꿉니다.",
                        "fill", Map.of("target_floor", 2, "target_room_name", "거실"),
                        "affected_entities", List.of(),
                        "warnings", List.of("2층 거실에는 현재 외벽 창문이 없어 시연이 어렵습니다."),
                        "metrics", List.of()
                )
        ));
        detailJson.put("job_id", jobId.toString());
        detailJson.put("step_no", 1);
        detailJson.put("clarification_request_id", UUID.randomUUID().toString());
        detailJson.put("timestamp", OffsetDateTime.now(ZoneOffset.UTC).toString());

        putJsonObject(detailKey, detailJson);

        JsonNode requestPayload = objectMapper.valueToTree(Map.of(
                "userInstruction", request.message(),
                "sourceSceneType", request.sourceSceneType(),
                "handler", "picture_window_demo"
        ));

        Map<String, Object> outputPayload = new LinkedHashMap<>();
        outputPayload.put("clarificationPossible", true);
        outputPayload.put("detailStorageUrl", detailStorageUrl);
        outputPayload.put("errorCode", "CLARIFICATION_REQUIRED");
        outputPayload.put("errorMessage", "어느 층 거실의 창문을 통창으로 바꿀지 선택하세요.");
        JsonNode outputJson = objectMapper.valueToTree(outputPayload);

        IfcEditJob job = IfcEditJob.createQueued(
                jobId, projectId, currentUserId,
                request.sourceSceneStateId(), request.baseRevisionId(),
                request.sourceSceneType(), IfcEditConstants.JOB_TYPE_IFC_EDIT,
                requestPayload, now
        );
        IfcEditJobStep step = IfcEditJobStep.createQueued(
                jobStepId, jobId, 1,
                IfcEditConstants.WORKER_TYPE_IFC_EDIT_APPLY, "picture-window-demo",
                jobId + ":step-1:picture-window-clarify",
                requestPayload, now
        );
        job.markFailed("어느 층 거실의 창문을 통창으로 바꿀지 선택하세요.", outputJson, now);
        step.markFailed("CLARIFICATION_REQUIRED",
                "어느 층 거실의 창문을 통창으로 바꿀지 선택하세요.", outputJson, now);

        ifcEditJobRepository.save(job);
        ifcEditJobStepRepository.save(step);

        log.info("PictureWindowDemo clarification 발사. projectId={}, jobId={}, detailStorageUrl={}",
                projectId, jobId, detailStorageUrl);

        return new IfcEditJobResponse(
                projectId, jobId, jobStepId, null, null,
                IfcEditConstants.JOB_TYPE_IFC_EDIT, "FAILED", 0
        );
    }

    private IfcEditJobResponse rejectSecondFloor(Project project, UUID currentUserId, ChatCommandRequest request) {
        UUID projectId = project.getProjectId();
        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();
        String errorMessage = "2층 거실에는 외벽 창문이 없어 통창 시연이 어렵습니다. 1층 거실로 다시 시도해주세요.";

        JsonNode requestPayload = objectMapper.valueToTree(Map.of(
                "userInstruction", request.message(),
                "handler", "picture_window_demo"
        ));
        Map<String, Object> outputPayload = new LinkedHashMap<>();
        outputPayload.put("errorCode", "PICTURE_WINDOW_NOT_AVAILABLE");
        outputPayload.put("errorMessage", errorMessage);
        JsonNode outputJson = objectMapper.valueToTree(outputPayload);

        IfcEditJob job = IfcEditJob.createQueued(
                jobId, projectId, currentUserId,
                request.sourceSceneStateId(), request.baseRevisionId(),
                request.sourceSceneType(), IfcEditConstants.JOB_TYPE_IFC_EDIT,
                requestPayload, now
        );
        IfcEditJobStep step = IfcEditJobStep.createQueued(
                jobStepId, jobId, 1,
                IfcEditConstants.WORKER_TYPE_IFC_EDIT_APPLY, "picture-window-demo",
                jobId + ":step-1:picture-window-reject",
                requestPayload, now
        );
        job.markFailed(errorMessage, outputJson, now);
        step.markFailed("PICTURE_WINDOW_NOT_AVAILABLE", errorMessage, outputJson, now);

        ifcEditJobRepository.save(job);
        ifcEditJobStepRepository.save(step);

        return new IfcEditJobResponse(
                projectId, jobId, jobStepId, null, null,
                IfcEditConstants.JOB_TYPE_IFC_EDIT, "FAILED", 0
        );
    }

    private IfcEditJobResponse executePictureWindow(Project project, UUID currentUserId, ChatCommandRequest request) {
        UUID projectId = project.getProjectId();
        UUID jobId = UUID.randomUUID();
        UUID jobStepId = UUID.randomUUID();
        UUID revisionId = UUID.randomUUID();
        UUID artifactId = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();

        int nextRevisionNo = revisionRepository.findTopByProjectIdOrderByRevisionNoDesc(projectId)
                .map(r -> r.getRevisionNo() + 1)
                .orElse(1);

        String destinationKey = String.format(
                "projects/%s/revisions/%s/ifc/model.v1.ifc",
                projectId, revisionId
        );
        String destinationStorageUrl = "s3://" + bucket + "/" + destinationKey;

        copyObject(PREBAKE_KEY, destinationKey);

        Revision revision = Revision.createCreating(
                revisionId, projectId, project.getLatestRevisionId(),
                nextRevisionNo, currentUserId,
                "거실 통창 시연", "1층 거실 서쪽 외벽 창 2개를 합친 통창",
                now
        );
        revision.markSucceeded();
        revisionRepository.save(revision);

        JsonNode requestPayload = objectMapper.valueToTree(Map.of(
                "userInstruction", request.message(),
                "handler", "picture_window_demo",
                "scope", "first_floor"
        ));
        Map<String, Object> outputPayload = new LinkedHashMap<>();
        outputPayload.put("ifcStorageUrl", destinationStorageUrl);
        outputPayload.put("handler", "picture_window_demo");
        JsonNode outputJson = objectMapper.valueToTree(outputPayload);

        IfcEditJob job = IfcEditJob.createQueued(
                jobId, projectId, currentUserId,
                request.sourceSceneStateId(), request.baseRevisionId(),
                request.sourceSceneType(), IfcEditConstants.JOB_TYPE_IFC_EDIT,
                requestPayload, now
        );
        IfcEditJobStep step = IfcEditJobStep.createQueued(
                jobStepId, jobId, 1,
                IfcEditConstants.WORKER_TYPE_IFC_EDIT_APPLY, "picture-window-demo",
                jobId + ":step-1:picture-window-apply",
                requestPayload, now
        );
        job.markSucceeded(outputJson, now);
        step.markSucceeded(outputJson, now);

        ifcEditJobRepository.save(job);
        ifcEditJobStepRepository.save(step);

        ifcEditArtifactRepository.save(IfcEditArtifact.createIfcModel(
                artifactId, projectId, revisionId, jobId, destinationStorageUrl, now
        ));

        project.updateLatestRevisionId(revisionId);
        ProjectWorkspace workspace = projectWorkspaceRepository
                .findByProjectIdAndProject_DeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.IFC_EDIT_EVENT_INVALID));
        workspace.updateIfcOutput(destinationStorageUrl, revisionId);

        log.info("PictureWindowDemo 1층 통창 적용 완료. projectId={}, jobId={}, revisionId={}, storageUrl={}",
                projectId, jobId, revisionId, destinationStorageUrl);

        return new IfcEditJobResponse(
                projectId, jobId, jobStepId, revisionId, artifactId,
                IfcEditConstants.JOB_TYPE_IFC_EDIT, "SUCCEEDED", 100
        );
    }

    private void copyObject(String sourceKey, String destinationKey) {
        try {
            s3Client.copyObject(CopyObjectRequest.builder()
                    .sourceBucket(bucket)
                    .sourceKey(sourceKey)
                    .destinationBucket(bucket)
                    .destinationKey(destinationKey)
                    .build());
        } catch (Exception e) {
            log.error("PictureWindowDemo S3 copy 실패. sourceKey={}, destinationKey={}",
                    sourceKey, destinationKey, e);
            throw new CustomException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    private void putJsonObject(String key, Map<String, Object> body) {
        try {
            byte[] bytes = objectMapper.writeValueAsBytes(body);
            s3Client.putObject(PutObjectRequest.builder()
                            .bucket(bucket)
                            .key(key)
                            .contentType("application/json; charset=utf-8")
                            .contentLength((long) bytes.length)
                            .build(),
                    RequestBody.fromBytes(bytes));
        } catch (Exception e) {
            log.error("PictureWindowDemo S3 putObject 실패. key={}", key, e);
            throw new CustomException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }

    private enum FloorIntent {
        FIRST_FLOOR,
        SECOND_FLOOR,
        AMBIGUOUS
    }

    // unused helper retained for future presigning if needed
    @SuppressWarnings("unused")
    private static byte[] utf8(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }
}
