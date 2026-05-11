package com.a204.batang.domain.render.service;

import com.a204.batang.domain.project.entity.Project;
import com.a204.batang.domain.project.repository.ProjectRepository;
import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.render.dto.ProjectRenderResponse;
import com.a204.batang.domain.render.dto.ProjectRenderStyleResponse;
import com.a204.batang.domain.render.entity.RenderArtifact;
import com.a204.batang.domain.render.entity.RenderJob;
import com.a204.batang.domain.render.repository.RenderArtifactRepository;
import com.a204.batang.domain.render.repository.RenderJobRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import com.a204.batang.global.storage.S3ObjectPresigner;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * 프로젝트 렌더링 결과 목록 조회를 담당하는 서비스.
 */
@Service
@Transactional(readOnly = true)
public class RenderQueryService {

    private static final String RENDER_JOB_TYPE = "SD_RENDER";
    private static final String RENDER_IMAGE_ARTIFACT_TYPE = "RENDER_IMAGE";
    private static final ZoneId KOREA_ZONE_ID = ZoneId.of("Asia/Seoul");

    private final ProjectRepository projectRepository;
    private final ProjectAccessService projectAccessService;
    private final RenderJobRepository renderJobRepository;
    private final RenderArtifactRepository renderArtifactRepository;
    private final S3ObjectPresigner s3ObjectPresigner;

    public RenderQueryService(
            ProjectRepository projectRepository,
            ProjectAccessService projectAccessService,
            RenderJobRepository renderJobRepository,
            RenderArtifactRepository renderArtifactRepository,
            S3ObjectPresigner s3ObjectPresigner
    ) {
        this.projectRepository = projectRepository;
        this.projectAccessService = projectAccessService;
        this.renderJobRepository = renderJobRepository;
        this.renderArtifactRepository = renderArtifactRepository;
        this.s3ObjectPresigner = s3ObjectPresigner;
    }

    /**
     * 프로젝트의 렌더링 결과 목록을 조회한다.
     */
    public List<ProjectRenderResponse> getProjectRenders(UUID projectId) {
        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectOwnerOrThrow(project, currentUserId);

        List<RenderJob> jobs = renderJobRepository.findByProjectIdAndJobTypeOrderByCreatedAtDescJobIdDesc(
                projectId,
                RENDER_JOB_TYPE
        );
        if (jobs.isEmpty()) {
            return List.of();
        }

        List<UUID> jobIds = jobs.stream()
                .map(RenderJob::getJobId)
                .toList();

        List<RenderArtifact> artifacts = renderArtifactRepository
                .findByProjectIdAndJobIdInAndArtifactTypeOrderByCreatedAtDescArtifactIdDesc(
                        projectId,
                        jobIds,
                        RENDER_IMAGE_ARTIFACT_TYPE
                );

        Map<UUID, RenderArtifact> latestArtifactByJobId = new LinkedHashMap<>();
        for (RenderArtifact artifact : artifacts) {
            latestArtifactByJobId.putIfAbsent(artifact.getJobId(), artifact);
        }

        return jobs.stream()
                .map(job -> toResponse(job, latestArtifactByJobId.get(job.getJobId())))
                .toList();
    }

    /**
     * 프로젝트의 렌더링 결과를 단건 조회한다.
     */
    public ProjectRenderResponse getProjectRender(UUID projectId, UUID renderId) {
        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectMemberOrThrow(project, currentUserId);

        RenderJob job = renderJobRepository.findByJobIdAndProjectIdAndJobType(renderId, projectId, RENDER_JOB_TYPE)
                .orElseThrow(() -> new CustomException(ErrorCode.RENDER_JOB_NOT_FOUND));

        String imageUrl = renderArtifactRepository
                .findFirstByProjectIdAndJobIdAndArtifactTypeOrderByCreatedAtDescArtifactIdDesc(
                        projectId,
                        renderId,
                        RENDER_IMAGE_ARTIFACT_TYPE
                )
                .map(this::presignArtifactUrl)
                .orElse(null);

        return toResponse(job, imageUrl);
    }

    /**
     * job과 artifact를 응답 DTO로 변환한다.
     */
    private ProjectRenderResponse toResponse(RenderJob job, RenderArtifact artifact) {
        return toResponse(job, artifact != null ? presignArtifactUrl(artifact) : null);
    }

    /**
     * job과 image URL을 응답 DTO로 변환한다.
     */
    private ProjectRenderResponse toResponse(RenderJob job, String imageUrl) {
        return new ProjectRenderResponse(
                job.getJobId(),
                extractStyle(job.getRequestPayload()),
                imageUrl,
                normalizeUpper(job.getStatus()),
                toUtcIso(job.getCreatedAt()),
                toUtcIso(job.getFinishedAt())
        );
    }

    private String presignArtifactUrl(RenderArtifact artifact) {
        return s3ObjectPresigner.presignRequired(artifact.getStorageUrl(), ErrorCode.RENDER_IMAGE_PRESIGN_FAILED);
    }

    /**
     * request payload에서 style 정보를 방어적으로 추출한다.
     */
    private ProjectRenderStyleResponse extractStyle(JsonNode requestPayload) {
        if (requestPayload == null) {
            return null;
        }

        JsonNode styleNode = requestPayload.path("style");
        if (styleNode.isMissingNode() || styleNode.isNull()) {
            return null;
        }

        String timeOfDay = firstNonBlank(
                styleNode.path("timeOfDay").asText(null),
                styleNode.path("time_of_day").asText(null)
        );
        String viewpoint = styleNode.path("viewpoint").asText(null);
        String season = styleNode.path("season").asText(null);
        String weather = styleNode.path("weather").asText(null);

        return new ProjectRenderStyleResponse(
                normalizeUpper(timeOfDay),
                normalizeUpper(viewpoint),
                normalizeUpper(season),
                normalizeUpper(weather)
        );
    }

    /**
     * 우선순위가 있는 두 문자열 중 첫 번째 유효값을 반환한다.
     */
    private String firstNonBlank(String primary, String fallback) {
        if (primary != null && !primary.isBlank()) {
            return primary;
        }
        if (fallback != null && !fallback.isBlank()) {
            return fallback;
        }
        return null;
    }

    /**
     * 문자열을 trim 후 대문자로 정규화한다.
     */
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

    /**
     * 로컬 시각을 UTC ISO-8601 문자열로 변환한다.
     *
     * <p>DB 컬럼 타입이 {@code TIMESTAMP WITHOUT TIME ZONE}이고,
     * JVM timezone 및 PostgreSQL timezone이 모두 Asia/Seoul(KST)로 설정된 환경을
     * 전제로 한다. 환경 타임존이 변경되면 이 변환 로직도 함께 검토해야 한다.
     */
    private String toUtcIso(LocalDateTime value) {
        if (value == null) {
            return null;
        }

        return value.atZone(KOREA_ZONE_ID)
                .withZoneSameInstant(ZoneOffset.UTC)
                .format(DateTimeFormatter.ISO_INSTANT);
    }
}
