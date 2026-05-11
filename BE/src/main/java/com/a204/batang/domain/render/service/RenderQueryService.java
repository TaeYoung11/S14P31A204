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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Duration;
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
    private static final String S3_SCHEME_PREFIX = "s3://";
    private static final String HTTP_PREFIX = "http://";
    private static final String HTTPS_PREFIX = "https://";
    private static final long FALLBACK_PRESIGN_EXPIRATION_SECONDS = 300L;

    private final ProjectRepository projectRepository;
    private final ProjectAccessService projectAccessService;
    private final RenderJobRepository renderJobRepository;
    private final RenderArtifactRepository renderArtifactRepository;
    private final S3Presigner s3Presigner;
    private final String configuredBucket;
    private final long presignExpirationSeconds;

    public RenderQueryService(
            ProjectRepository projectRepository,
            ProjectAccessService projectAccessService,
            RenderJobRepository renderJobRepository,
            RenderArtifactRepository renderArtifactRepository,
            S3Presigner s3Presigner,
            @Value("${app.aws.s3.bucket}") String configuredBucket,
            @Value("${app.aws.s3.presign-expiration-seconds}") long presignExpirationSeconds
    ) {
        this.projectRepository = projectRepository;
        this.projectAccessService = projectAccessService;
        this.renderJobRepository = renderJobRepository;
        this.renderArtifactRepository = renderArtifactRepository;
        this.s3Presigner = s3Presigner;
        this.configuredBucket = configuredBucket == null ? "" : configuredBucket.trim();
        this.presignExpirationSeconds = presignExpirationSeconds;
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
     * ?꾨줈?앺듃???뚮뜑留?寃곌낵瑜?醫고쉶?쒕떎.
     */
    public ProjectRenderResponse getProjectRender(UUID projectId, UUID renderId) {
        Project project = projectRepository.findByProjectIdAndDeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        UUID currentUserId = projectAccessService.resolveCurrentUserId();
        projectAccessService.validateProjectOwnerOrThrow(project, currentUserId);

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
        return toResponse(job, artifact != null ? artifact.getStorageUrl() : null);
    }

    /**
     * job怨?image URL瑜??묐떟 DTO濡?蹂?섑븳??.
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
        try {
            S3ObjectLocation objectLocation = resolveS3ObjectLocation(artifact.getStorageUrl());
            GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                    .bucket(objectLocation.bucket())
                    .key(objectLocation.key())
                    .build();
            GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                    .signatureDuration(resolveSignatureDuration())
                    .getObjectRequest(getObjectRequest)
                    .build();

            return s3Presigner.presignGetObject(presignRequest).url().toString();
        } catch (CustomException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new CustomException(ErrorCode.RENDER_IMAGE_PRESIGN_FAILED);
        }
    }

    private Duration resolveSignatureDuration() {
        if (presignExpirationSeconds <= 0) {
            return Duration.ofSeconds(FALLBACK_PRESIGN_EXPIRATION_SECONDS);
        }
        return Duration.ofSeconds(presignExpirationSeconds);
    }

    private S3ObjectLocation resolveS3ObjectLocation(String storageUrl) {
        if (!StringUtils.hasText(storageUrl)) {
            throw new CustomException(ErrorCode.RENDER_IMAGE_PRESIGN_FAILED);
        }

        String normalizedStorageUrl = storageUrl.trim();
        if (normalizedStorageUrl.startsWith(S3_SCHEME_PREFIX)) {
            return resolveS3SchemeLocation(normalizedStorageUrl);
        }
        if (normalizedStorageUrl.startsWith(HTTP_PREFIX) || normalizedStorageUrl.startsWith(HTTPS_PREFIX)) {
            return resolveHttpLocation(normalizedStorageUrl);
        }
        return resolveObjectKeyLocation(normalizedStorageUrl);
    }

    private S3ObjectLocation resolveS3SchemeLocation(String s3Url) {
        String withoutScheme = s3Url.substring(S3_SCHEME_PREFIX.length());
        int separatorIndex = withoutScheme.indexOf('/');
        if (separatorIndex <= 0 || separatorIndex >= withoutScheme.length() - 1) {
            throw new CustomException(ErrorCode.RENDER_IMAGE_PRESIGN_FAILED);
        }

        String bucket = withoutScheme.substring(0, separatorIndex).trim();
        String key = withoutScheme.substring(separatorIndex + 1).trim();
        return new S3ObjectLocation(validateBucketOrThrow(bucket), validateKeyOrThrow(key));
    }

    private S3ObjectLocation resolveHttpLocation(String httpUrl) {
        URI uri;
        try {
            uri = new URI(httpUrl);
        } catch (URISyntaxException exception) {
            throw new CustomException(ErrorCode.RENDER_IMAGE_PRESIGN_FAILED);
        }

        String host = uri.getHost();
        String rawPath = uri.getPath();
        if (!StringUtils.hasText(host) || !StringUtils.hasText(rawPath) || "/".equals(rawPath)) {
            throw new CustomException(ErrorCode.RENDER_IMAGE_PRESIGN_FAILED);
        }

        String normalizedHost = host.toLowerCase(Locale.ROOT);
        String normalizedPath = stripLeadingSlash(rawPath);

        int virtualHostedIndex = normalizedHost.indexOf(".s3.");
        if (virtualHostedIndex > 0) {
            String bucket = host.substring(0, virtualHostedIndex).trim();
            return new S3ObjectLocation(validateBucketOrThrow(bucket), validateKeyOrThrow(normalizedPath));
        }

        if (normalizedHost.equals("s3.amazonaws.com")
                || normalizedHost.startsWith("s3.")
                || normalizedHost.startsWith("s3-")) {
            int separatorIndex = normalizedPath.indexOf('/');
            if (separatorIndex <= 0 || separatorIndex >= normalizedPath.length() - 1) {
                throw new CustomException(ErrorCode.RENDER_IMAGE_PRESIGN_FAILED);
            }

            String bucket = normalizedPath.substring(0, separatorIndex).trim();
            String key = normalizedPath.substring(separatorIndex + 1).trim();
            return new S3ObjectLocation(validateBucketOrThrow(bucket), validateKeyOrThrow(key));
        }

        throw new CustomException(ErrorCode.RENDER_IMAGE_PRESIGN_FAILED);
    }

    private S3ObjectLocation resolveObjectKeyLocation(String keyOnlyPath) {
        if (!StringUtils.hasText(configuredBucket)) {
            throw new CustomException(ErrorCode.RENDER_IMAGE_PRESIGN_FAILED);
        }
        return new S3ObjectLocation(configuredBucket, validateKeyOrThrow(keyOnlyPath.trim()));
    }

    private String validateBucketOrThrow(String bucket) {
        if (!StringUtils.hasText(bucket)) {
            throw new CustomException(ErrorCode.RENDER_IMAGE_PRESIGN_FAILED);
        }

        String normalizedBucket = bucket.trim();
        if (!StringUtils.hasText(configuredBucket)) {
            return normalizedBucket;
        }
        if (!configuredBucket.equals(normalizedBucket)) {
            throw new CustomException(ErrorCode.RENDER_IMAGE_PRESIGN_FAILED);
        }
        return normalizedBucket;
    }

    private String validateKeyOrThrow(String key) {
        String normalizedKey = stripLeadingSlash(key);
        if (!StringUtils.hasText(normalizedKey)) {
            throw new CustomException(ErrorCode.RENDER_IMAGE_PRESIGN_FAILED);
        }
        return normalizedKey;
    }

    private String stripLeadingSlash(String value) {
        String normalizedValue = value;
        while (normalizedValue.startsWith("/")) {
            normalizedValue = normalizedValue.substring(1);
        }
        return normalizedValue;
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

    private record S3ObjectLocation(String bucket, String key) {
    }
}
