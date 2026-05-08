package com.a204.batang.domain.job.messaging.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.UUID;

/**
 * 공통 worker event에서 라우팅 판단에 필요한 필드만 읽는 중립 DTO이다.
 *
 * <p>실제 도메인 처리에는 원본 payload를 각 도메인 DTO로 다시 변환한다.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CommonJobEventMessage(
        @JsonProperty("event_type")
        String eventType,
        @JsonProperty("job_id")
        UUID jobId,
        @JsonProperty("job_step_id")
        UUID jobStepId
) {
}
