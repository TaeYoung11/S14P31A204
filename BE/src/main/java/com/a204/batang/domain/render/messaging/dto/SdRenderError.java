package com.a204.batang.domain.render.messaging.dto;

public record SdRenderError(
        String code,
        String message,
        Boolean retryable,
        Boolean clarificationPossible,
        String detailStorageUrl
) {
}
