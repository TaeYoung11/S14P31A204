package com.a204.batang.domain.ifcedit.messaging.event;

import com.a204.batang.domain.ifcedit.messaging.dto.IfcEditCommandMessage;

public record IfcEditCommandPublishRequestedEvent(
        IfcEditCommandMessage message
) {
}
