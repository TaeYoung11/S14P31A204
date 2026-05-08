package com.a204.batang.domain.ifcedit.messaging.event;

import com.a204.batang.domain.ifcedit.dto.IfcEditStatusSseResponse;

import java.util.UUID;

public record IfcEditStatusChangedEvent(
        UUID projectId,
        String eventName,
        IfcEditStatusSseResponse payload
) {
}
