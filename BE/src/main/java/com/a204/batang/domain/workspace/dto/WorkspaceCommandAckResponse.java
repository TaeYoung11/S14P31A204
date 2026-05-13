package com.a204.batang.domain.workspace.dto;

import java.util.UUID;

public record WorkspaceCommandAckResponse(
        UUID commandId,
        String status,
        String message
) {
    public static WorkspaceCommandAckResponse accepted(UUID commandId) {
        return new WorkspaceCommandAckResponse(commandId, "ACCEPTED", null);
    }

    public static WorkspaceCommandAckResponse duplicate(UUID commandId) {
        return new WorkspaceCommandAckResponse(commandId, "DUPLICATE", null);
    }
}
