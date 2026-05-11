package com.a204.batang.domain.workspace.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.List;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * floor-plan 산출물 S3 삭제 대기열을 Redis Set으로 관리한다.
 *
 * <p>중복 URL 적재를 방지하기 위해 Set을 사용하며, 스케줄러가 배치 단위로 꺼내 처리한다.
 */
@Service
@RequiredArgsConstructor
public class FloorPlanS3DeleteQueueService {

    private final RedisTemplate<String, String> redisTemplate;

    @Value("${app.aws.s3.delete.queue-key:workspace:floor-plan:s3:delete:queue}")
    private String queueKey;

    /**
     * 삭제 대상 S3 URL을 대기열에 적재한다.
     *
     * @param s3Urls 삭제 대기열에 추가할 S3 URL 목록
     */
    public void enqueueAll(Collection<String> s3Urls) {
        if (s3Urls == null || s3Urls.isEmpty()) {
            return;
        }

        Set<String> normalized = normalizeUrls(s3Urls);
        if (normalized.isEmpty()) {
            return;
        }

        redisTemplate.opsForSet().add(queueKey, normalized.toArray(String[]::new));
    }

    /**
     * 삭제 대기열에서 배치 크기만큼 URL을 꺼낸다.
     *
     * @param batchSize 최대 조회 개수
     * @return 꺼낸 URL 집합
     */
    public Set<String> popBatch(int batchSize) {
        if (batchSize <= 0) {
            return Set.of();
        }

        List<String> poppedUrls = redisTemplate.opsForSet().pop(queueKey, batchSize);
        if (poppedUrls == null || poppedUrls.isEmpty()) {
            return Set.of();
        }
        return new LinkedHashSet<>(poppedUrls);
    }

    /**
     * 삭제 실패 URL을 대기열에 재적재한다.
     *
     * @param s3Urls 재적재할 URL 목록
     */
    public void requeueAll(Collection<String> s3Urls) {
        enqueueAll(s3Urls);
    }

    private Set<String> normalizeUrls(Collection<String> s3Urls) {
        Set<String> normalized = new LinkedHashSet<>();
        for (String s3Url : s3Urls) {
            if (s3Url == null) {
                continue;
            }

            String trimmed = s3Url.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            normalized.add(trimmed);
        }
        return normalized;
    }
}
