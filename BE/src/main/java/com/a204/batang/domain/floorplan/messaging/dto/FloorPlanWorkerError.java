package com.a204.batang.domain.floorplan.messaging.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Floor-plan worker failed 이벤트의 에러 payload이다.
 */
public record FloorPlanWorkerError(
        @JsonProperty("code")
        String code,
        @JsonProperty("message")
        String message,
        @JsonProperty("retryable")
        Boolean retryable,
        @JsonProperty("clarification_possible")
        Boolean clarificationPossible,
        @JsonProperty("detail_storage_url")
        String detailStorageUrl
) {
}
