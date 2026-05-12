package com.a204.batang.domain.workspace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * floor-plan S3 지연 삭제 배치를 새벽에 실행한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FloorPlanS3DeletionScheduler {

    private final FloorPlanS3BatchDeletionService floorPlanS3BatchDeletionService;

    /**
     * Redis 삭제 대기열에 쌓인 floor-plan 산출물을 스케줄러로 일괄 삭제한다.
     */
    @Scheduled(cron = "${app.aws.s3.delete.schedule-cron:0 0 4 * * *}", zone = "${app.aws.s3.delete.schedule-zone:Asia/Seoul}")
    public void runDeferredDeletion() {
        log.info("Floor-plan deferred S3 deletion scheduler started.");
        floorPlanS3BatchDeletionService.deleteQueuedObjects();
    }
}
