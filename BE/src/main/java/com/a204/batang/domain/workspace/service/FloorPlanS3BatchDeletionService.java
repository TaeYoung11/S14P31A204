package com.a204.batang.domain.workspace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.Delete;
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectsResponse;
import software.amazon.awssdk.services.s3.model.ObjectIdentifier;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Redis 삭제 대기열에 쌓인 floor-plan S3 산출물을 배치 삭제한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FloorPlanS3BatchDeletionService {

    private static final String S3_SCHEME_PREFIX = "s3://";
    private static final int S3_DELETE_MAX_OBJECTS_PER_REQUEST = 1000;

    private final FloorPlanS3DeleteQueueService floorPlanS3DeleteQueueService;
    private final S3Client s3Client;

    @Value("${app.aws.s3.bucket:}")
    private String configuredBucket;

    @Value("${app.aws.s3.delete.batch-size:500}")
    private int deleteBatchSize;

    /**
     * Redis 삭제 대기열을 모두 소진할 때까지 배치 삭제를 수행한다.
     */
    public void deleteQueuedObjects() {
        int totalRequested = 0;
        int loopCount = 0;

        while (true) {
            Set<String> urlBatch = floorPlanS3DeleteQueueService.popBatch(deleteBatchSize);
            if (urlBatch.isEmpty()) {
                break;
            }

            loopCount++;
            totalRequested += urlBatch.size();
            deleteOneBatch(urlBatch);
        }

        if (loopCount > 0) {
            log.info("Floor-plan S3 deferred deletion completed. batchCount={}, requestedCount={}", loopCount, totalRequested);
        }
    }

    private void deleteOneBatch(Set<String> s3Urls) {
        Map<String, Map<String, String>> bucketToKeyUrlMap = new LinkedHashMap<>();

        for (String s3Url : s3Urls) {
            S3ObjectLocation location = parseS3ObjectLocation(s3Url);
            if (location == null) {
                log.warn("Skip floor-plan deferred deletion because URL format is invalid. s3Url={}", s3Url);
                continue;
            }

            bucketToKeyUrlMap
                    .computeIfAbsent(location.bucket(), ignored -> new LinkedHashMap<>())
                    .put(location.key(), s3Url);
        }

        for (Map.Entry<String, Map<String, String>> entry : bucketToKeyUrlMap.entrySet()) {
            String bucket = entry.getKey();
            Map<String, String> keyToUrlMap = entry.getValue();
            List<String> keys = new ArrayList<>(keyToUrlMap.keySet());

            for (int start = 0; start < keys.size(); start += S3_DELETE_MAX_OBJECTS_PER_REQUEST) {
                int end = Math.min(start + S3_DELETE_MAX_OBJECTS_PER_REQUEST, keys.size());
                List<String> chunkKeys = keys.subList(start, end);
                deleteChunk(bucket, chunkKeys, keyToUrlMap);
            }
        }
    }

    private void deleteChunk(String bucket, List<String> chunkKeys, Map<String, String> keyToUrlMap) {
        List<ObjectIdentifier> objectIdentifiers = chunkKeys.stream()
                .map(key -> ObjectIdentifier.builder().key(key).build())
                .toList();

        DeleteObjectsRequest request = DeleteObjectsRequest.builder()
                .bucket(bucket)
                .delete(Delete.builder().objects(objectIdentifiers).build())
                .build();

        try {
            DeleteObjectsResponse response = s3Client.deleteObjects(request);
            requeueFailedObjects(response, keyToUrlMap);
        } catch (Exception exception) {
            log.error("Failed to delete floor-plan S3 objects. bucket={}, objectCount={}",
                    bucket, chunkKeys.size(), exception);
            Set<String> failedUrls = new LinkedHashSet<>();
            for (String key : chunkKeys) {
                String url = keyToUrlMap.get(key);
                if (url != null) {
                    failedUrls.add(url);
                }
            }
            floorPlanS3DeleteQueueService.requeueAll(failedUrls);
        }
    }

    private void requeueFailedObjects(DeleteObjectsResponse response, Map<String, String> keyToUrlMap) {
        if (response == null || !response.hasErrors() || response.errors().isEmpty()) {
            return;
        }

        Set<String> failedUrls = new LinkedHashSet<>();
        response.errors().forEach(error -> {
            String key = error.key();
            String url = keyToUrlMap.get(key);
            if (url != null) {
                failedUrls.add(url);
            }
            log.warn("S3 deferred deletion partially failed. key={}, code={}, message={}",
                    key, error.code(), error.message());
        });

        floorPlanS3DeleteQueueService.requeueAll(failedUrls);
    }

    private S3ObjectLocation parseS3ObjectLocation(String rawS3Url) {
        if (!StringUtils.hasText(rawS3Url)) {
            return null;
        }

        String s3Url = rawS3Url.trim();
        if (s3Url.startsWith(S3_SCHEME_PREFIX)) {
            return parseS3SchemeUrl(s3Url);
        }

        if (s3Url.startsWith("http://") || s3Url.startsWith("https://")) {
            return parseHttpStyleS3Url(s3Url);
        }

        return parseKeyOnlyPath(s3Url);
    }

    private S3ObjectLocation parseS3SchemeUrl(String s3Url) {
        String withoutScheme = s3Url.substring(S3_SCHEME_PREFIX.length());
        int separatorIndex = withoutScheme.indexOf('/');
        if (separatorIndex <= 0 || separatorIndex == withoutScheme.length() - 1) {
            return null;
        }

        String bucket = withoutScheme.substring(0, separatorIndex).trim();
        String key = withoutScheme.substring(separatorIndex + 1).trim();
        return validateLocation(bucket, key);
    }

    private S3ObjectLocation parseHttpStyleS3Url(String httpUrl) {
        URI uri;
        try {
            uri = URI.create(httpUrl);
        } catch (IllegalArgumentException exception) {
            return null;
        }

        String host = uri.getHost();
        if (!StringUtils.hasText(host)) {
            return null;
        }

        String normalizedHost = host.toLowerCase();
        String normalizedPath = normalizePath(uri.getPath());

        int virtualHostedIndex = normalizedHost.indexOf(".s3.");
        if (virtualHostedIndex > 0 && StringUtils.hasText(normalizedPath)) {
            String bucket = normalizedHost.substring(0, virtualHostedIndex);
            return validateLocation(bucket, normalizedPath);
        }

        if (normalizedHost.equals("s3.amazonaws.com")
                || normalizedHost.startsWith("s3.")
                || normalizedHost.startsWith("s3-")) {
            int pathSeparatorIndex = normalizedPath.indexOf('/');
            if (pathSeparatorIndex <= 0 || pathSeparatorIndex == normalizedPath.length() - 1) {
                return null;
            }
            String bucket = normalizedPath.substring(0, pathSeparatorIndex);
            String key = normalizedPath.substring(pathSeparatorIndex + 1);
            return validateLocation(bucket, key);
        }

        return null;
    }

    private S3ObjectLocation parseKeyOnlyPath(String keyOnlyPath) {
        if (!StringUtils.hasText(configuredBucket)) {
            return null;
        }
        return validateLocation(configuredBucket.trim(), keyOnlyPath.trim());
    }

    private String normalizePath(String path) {
        if (!StringUtils.hasText(path)) {
            return "";
        }
        String normalized = path.trim();
        if (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        return normalized;
    }

    private S3ObjectLocation validateLocation(String bucket, String key) {
        if (!StringUtils.hasText(bucket) || !StringUtils.hasText(key)) {
            return null;
        }
        return new S3ObjectLocation(bucket.trim(), key.trim());
    }

    private record S3ObjectLocation(String bucket, String key) {
    }
}
