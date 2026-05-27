package com.a204.batang.domain.ifcedit.service;

import com.a204.batang.domain.ifcedit.dto.IfcEditStatusSseResponse;
import com.a204.batang.domain.ifcedit.entity.IfcEditJob;
import com.a204.batang.domain.ifcedit.entity.IfcEditJobStep;
import com.a204.batang.domain.ifcedit.messaging.event.IfcEditStatusChangedEvent;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobRepository;
import com.a204.batang.domain.ifcedit.repository.IfcEditJobStepRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.a204.batang.domain.ifcedit.IfcEditConstants.JOB_TYPE_IFC_EDIT;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.JOB_TYPE_THREE_D_TO_IFC_EDIT;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.JOB_TYPE_TWO_D_TO_IFC_EDIT;
import static com.a204.batang.domain.ifcedit.IfcEditConstants.SSE_IFC_EDIT_FAILED;

@Slf4j
@Service
@RequiredArgsConstructor
public class IfcEditActiveJobGuard {

    private static final List<String> ACTIVE_STATUSES = List.of("QUEUED", "RUNNING");
    private static final List<String> BLOCKING_JOB_TYPES = List.of(
            JOB_TYPE_IFC_EDIT,
            JOB_TYPE_TWO_D_TO_IFC_EDIT,
            JOB_TYPE_THREE_D_TO_IFC_EDIT
    );
    private static final String STALE_ERROR_CODE = "IFC_EDIT_STALE_ACTIVE_JOB";

    private final IfcEditJobRepository ifcEditJobRepository;
    private final IfcEditJobStepRepository ifcEditJobStepRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    @Value("${batang.ifc-edit.active-job-timeout-seconds:600}")
    private long activeJobTimeoutSeconds;

    @Transactional
    public boolean hasBlockingActiveJob(UUID projectId) {
        expireStaleActiveJobs(projectId);
        return ifcEditJobRepository.existsByProjectIdAndJobTypeInAndStatusIn(
                projectId,
                BLOCKING_JOB_TYPES,
                ACTIVE_STATUSES
        );
    }

    private void expireStaleActiveJobs(UUID projectId) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime cutoff = now.minusSeconds(activeJobTimeoutSeconds);
        List<IfcEditJob> activeJobs = ifcEditJobRepository.findAllByProjectIdAndJobTypeInAndStatusInOrderByCreatedAtAsc(
                projectId,
                BLOCKING_JOB_TYPES,
                ACTIVE_STATUSES
        );

        for (IfcEditJob job : activeJobs) {
            LocalDateTime referenceTime = job.getStartedAt() != null ? job.getStartedAt() : job.getCreatedAt();
            if (referenceTime == null || !referenceTime.isBefore(cutoff)) {
                continue;
            }

            String errorMessage = "이전 IFC 편집 작업이 비정상적으로 오래 진행 중이어서 자동 종료되었습니다. 다시 시도해 주세요.";
            Map<String, Object> payloadMap = new LinkedHashMap<>();
            payloadMap.put("errorCode", STALE_ERROR_CODE);
            payloadMap.put("errorMessage", errorMessage);
            payloadMap.put("autoRecovered", true);
            payloadMap.put("staleTimeoutSeconds", activeJobTimeoutSeconds);

            var payload = objectMapper.valueToTree(payloadMap);
            List<IfcEditJobStep> steps = ifcEditJobStepRepository.findAllByJobIdOrderByStepNoAsc(job.getJobId());
            IfcEditJobStep affectedStep = null;
            for (IfcEditJobStep step : steps) {
                if (step.isTerminal()) {
                    continue;
                }
                step.markFailed(STALE_ERROR_CODE, errorMessage, payload, now);
                affectedStep = step;
            }
            job.markFailed(errorMessage, payload, now);

            ifcEditJobStepRepository.saveAll(steps);
            ifcEditJobRepository.save(job);

            log.warn("Expired stale IFC edit job before accepting a new request. projectId={}, jobId={}, timeoutSeconds={}",
                    projectId, job.getJobId(), activeJobTimeoutSeconds);

            eventPublisher.publishEvent(new IfcEditStatusChangedEvent(
                    projectId,
                    SSE_IFC_EDIT_FAILED,
                    new IfcEditStatusSseResponse(
                            SSE_IFC_EDIT_FAILED,
                            projectId,
                            job.getJobId(),
                            affectedStep != null ? affectedStep.getJobStepId() : null,
                            null,
                            job.getJobType(),
                            "FAILED",
                            0,
                            errorMessage
                    )
            ));
        }
    }
}
