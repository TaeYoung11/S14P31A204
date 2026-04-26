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
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * 프로젝트 렌더링 결과 목록 조회를 담당하는 서비스.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RenderQueryService {

    private static final String RENDER_JOB_TYPE = "RENDER";
    private static final String RENDER_IMAGE_ARTIFACT_TYPE = "RENDER_IMAGE";

    private final ProjectRepository projectRepository;
    private final ProjectAccessService projectAccessService;
    private final RenderJobRepository renderJobRepository;
    private final RenderArtifactRepository renderArtifactRepository;

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

    private ProjectRenderResponse toResponse(RenderJob job, RenderArtifact artifact) {
        return new ProjectRenderResponse(
                job.getJobId(),
                extractStyle(job.getRequestPayload()),
                artifact != null ? artifact.getStorageUrl() : null,
                normalizeUpper(job.getStatus()),
                job.getCreatedAt(),
                job.getFinishedAt()
        );
    }

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

    private String firstNonBlank(String primary, String fallback) {
        if (primary != null && !primary.isBlank()) {
            return primary;
        }
        if (fallback != null && !fallback.isBlank()) {
            return fallback;
        }
        return null;
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
}
