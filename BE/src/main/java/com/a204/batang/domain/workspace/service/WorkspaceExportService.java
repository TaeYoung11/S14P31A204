package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.project.service.ProjectAccessService;
import com.a204.batang.domain.workspace.dto.ExportFloorPlanIfcResponse;
import com.a204.batang.domain.workspace.entity.ProjectWorkspace;
import com.a204.batang.domain.workspace.repository.ProjectWorkspaceRepository;
import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.UUID;

/**
 * 프로젝트의 IFC 파일 내보내기 URL(presigned URL)을 발급한다.
 */
@Slf4j
@Service
@Transactional(readOnly = true)
public class WorkspaceExportService {

    private static final String S3_SCHEME_PREFIX = "s3://";
    private static final String HTTP_PREFIX = "http://";
    private static final String HTTPS_PREFIX = "https://";
    private static final long FALLBACK_PRESIGN_EXPIRATION_SECONDS = 300L;

    private final ProjectWorkspaceRepository projectWorkspaceRepository;
    private final ProjectAccessService projectAccessService;
    private final S3Presigner s3Presigner;
    private final String configuredBucket;
    private final long presignExpirationSeconds;

    /**
     * IFC 내보내기 서비스를 생성한다.
     *
     * @param projectWorkspaceRepository 워크스페이스 조회 저장소
     * @param projectAccessService 프로젝트 접근 권한 서비스
     * @param s3Presigner S3 presigned URL 생성기
     * @param configuredBucket 기본 S3 버킷명
     * @param presignExpirationSeconds presigned URL 유효 시간(초)
     */
    public WorkspaceExportService(
            ProjectWorkspaceRepository projectWorkspaceRepository,
            ProjectAccessService projectAccessService,
            S3Presigner s3Presigner,
            @Value("${app.aws.s3.bucket}") String configuredBucket,
            @Value("${app.aws.s3.presign-expiration-seconds}") long presignExpirationSeconds
    ) {
        this.projectWorkspaceRepository = projectWorkspaceRepository;
        this.projectAccessService = projectAccessService;
        this.s3Presigner = s3Presigner;
        this.configuredBucket = configuredBucket == null ? "" : configuredBucket.trim();
        this.presignExpirationSeconds = presignExpirationSeconds;
    }

    /**
     * 현재 프로젝트의 최신 IFC를 다운로드할 수 있는 presigned URL을 생성한다.
     *
     * @param projectId 프로젝트 ID
     * @return IFC export 응답 DTO
     */
    public ExportFloorPlanIfcResponse exportFloorPlanIfc(UUID projectId) {
        UUID currentUserId = projectAccessService.resolveCurrentUserIdOrThrow();
        projectAccessService.validateProjectPinWriterOrThrow(projectId, currentUserId);

        ProjectWorkspace workspace = projectWorkspaceRepository.findByProjectIdAndProject_DeletedAtIsNull(projectId)
                .orElseThrow(() -> new CustomException(ErrorCode.PROJECT_NOT_FOUND));

        String ifcStorageUrl = workspace.getIfcStorageUrl();
        if (!StringUtils.hasText(ifcStorageUrl)) {
            throw new CustomException(ErrorCode.WORKSPACE_IFC_EXPORT_SOURCE_NOT_FOUND);
        }

        S3ObjectLocation objectLocation = resolveS3ObjectLocation(ifcStorageUrl.trim());
        String downloadFileName = buildDownloadFileName(projectId, workspace.getCurrentRevision());
        Duration signatureDuration = resolveSignatureDuration();

        GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                .bucket(objectLocation.bucket())
                .key(objectLocation.key())
                .responseContentDisposition("attachment; filename=\"" + downloadFileName + "\"")
                .build();

        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration(signatureDuration)
                .getObjectRequest(getObjectRequest)
                .build();

        try {
            PresignedGetObjectRequest presignedGetObjectRequest = s3Presigner.presignGetObject(presignRequest);
            LocalDateTime expiresAt = LocalDateTime.now().plus(signatureDuration);

            log.info(
                    "IFC export presigned URL generated. projectId={}, revisionId={}, bucket={}, key={}",
                    projectId,
                    workspace.getCurrentRevision(),
                    objectLocation.bucket(),
                    objectLocation.key()
            );

            return new ExportFloorPlanIfcResponse(
                    projectId,
                    workspace.getCurrentRevision(),
                    ifcStorageUrl,
                    presignedGetObjectRequest.url().toString(),
                    expiresAt
            );
        } catch (SdkException exception) {
            log.warn(
                    "Failed to generate IFC export presigned URL. projectId={}, ifcStorageUrl={}",
                    projectId,
                    ifcStorageUrl,
                    exception
            );
            throw new CustomException(
                    ErrorCode.WORKSPACE_IFC_EXPORT_PRESIGN_FAILED,
                    "IFC 내보내기 presigned URL 생성에 실패했습니다."
            );
        }
    }

    private Duration resolveSignatureDuration() {
        if (presignExpirationSeconds <= 0) {
            log.warn(
                    "Invalid presign expiration seconds configured. fallback={}s, configured={}s",
                    FALLBACK_PRESIGN_EXPIRATION_SECONDS,
                    presignExpirationSeconds
            );
            return Duration.ofSeconds(FALLBACK_PRESIGN_EXPIRATION_SECONDS);
        }
        return Duration.ofSeconds(presignExpirationSeconds);
    }

    private S3ObjectLocation resolveS3ObjectLocation(String ifcStorageUrl) {
        if (ifcStorageUrl.startsWith(S3_SCHEME_PREFIX)) {
            return resolveS3SchemeLocation(ifcStorageUrl);
        }
        if (ifcStorageUrl.startsWith(HTTP_PREFIX) || ifcStorageUrl.startsWith(HTTPS_PREFIX)) {
            return resolveHttpLocation(ifcStorageUrl);
        }
        return resolveObjectKeyLocation(ifcStorageUrl);
    }

    private S3ObjectLocation resolveS3SchemeLocation(String s3Url) {
        String withoutScheme = s3Url.substring(S3_SCHEME_PREFIX.length());
        int separatorIndex = withoutScheme.indexOf('/');
        if (separatorIndex <= 0 || separatorIndex >= withoutScheme.length() - 1) {
            throw new CustomException(ErrorCode.WORKSPACE_IFC_EXPORT_URL_INVALID, "s3://{bucket}/{key} 형식이어야 합니다.");
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
            throw new CustomException(ErrorCode.WORKSPACE_IFC_EXPORT_URL_INVALID, "유효하지 않은 IFC HTTP URL입니다.");
        }

        String host = uri.getHost();
        String rawPath = uri.getPath();
        if (!StringUtils.hasText(host) || !StringUtils.hasText(rawPath) || "/".equals(rawPath)) {
            throw new CustomException(ErrorCode.WORKSPACE_IFC_EXPORT_URL_INVALID, "IFC HTTP URL에서 bucket/key를 추출할 수 없습니다.");
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
                throw new CustomException(ErrorCode.WORKSPACE_IFC_EXPORT_URL_INVALID, "path-style S3 URL에서 bucket/key를 추출할 수 없습니다.");
            }

            String bucket = normalizedPath.substring(0, separatorIndex).trim();
            String key = normalizedPath.substring(separatorIndex + 1).trim();
            return new S3ObjectLocation(validateBucketOrThrow(bucket), validateKeyOrThrow(key));
        }

        throw new CustomException(
                ErrorCode.WORKSPACE_IFC_EXPORT_URL_INVALID,
                "지원하지 않는 IFC S3 URL 형식입니다. s3:// 또는 Amazon S3 URL을 사용하세요."
        );
    }

    private S3ObjectLocation resolveObjectKeyLocation(String keyOnlyPath) {
        if (!StringUtils.hasText(configuredBucket)) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_IFC_EXPORT_URL_INVALID,
                    "bucket 정보가 없는 IFC 경로는 app.aws.s3.bucket 설정이 필요합니다."
            );
        }
        return new S3ObjectLocation(configuredBucket, validateKeyOrThrow(keyOnlyPath.trim()));
    }

    private String validateBucketOrThrow(String bucket) {
        if (!StringUtils.hasText(bucket)) {
            throw new CustomException(ErrorCode.WORKSPACE_IFC_EXPORT_URL_INVALID, "bucket 값이 비어 있습니다.");
        }

        String normalizedBucket = bucket.trim();
        if (!StringUtils.hasText(configuredBucket)) {
            return normalizedBucket;
        }

        if (!configuredBucket.equals(normalizedBucket)) {
            throw new CustomException(
                    ErrorCode.WORKSPACE_IFC_EXPORT_URL_INVALID,
                    "요청된 IFC bucket이 서버 설정 bucket과 일치하지 않습니다."
            );
        }
        return normalizedBucket;
    }

    private String validateKeyOrThrow(String key) {
        String normalizedKey = stripLeadingSlash(key);
        if (!StringUtils.hasText(normalizedKey)) {
            throw new CustomException(ErrorCode.WORKSPACE_IFC_EXPORT_URL_INVALID, "S3 object key가 비어 있습니다.");
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

    private String buildDownloadFileName(UUID projectId, String revisionId) {
        String normalizedRevisionId = StringUtils.hasText(revisionId) ? revisionId.trim() : "latest";
        String rawFileName = "project-%s-%s.ifc".formatted(projectId, normalizedRevisionId);
        return rawFileName.replaceAll("[^A-Za-z0-9._-]", "_");
    }

    private record S3ObjectLocation(String bucket, String key) {
    }
}
