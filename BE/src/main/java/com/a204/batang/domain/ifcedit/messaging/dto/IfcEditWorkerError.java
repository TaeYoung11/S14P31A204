package com.a204.batang.domain.ifcedit.messaging.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record IfcEditWorkerError(
        @JsonProperty("code") String code,
        @JsonProperty("message") String message,
        @JsonProperty("retryable") Boolean retryable,
        @JsonProperty("clarification_possible") Boolean clarificationPossible,
        @JsonProperty("detail_storage_url") String detailStorageUrl
) {
}
