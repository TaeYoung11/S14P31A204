package com.a204.batang.domain.workspace.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record WorkspaceCommand(
        @NotBlank(message = "command.op is required.")
        @Pattern(regexp = "create|update|delete", message = "command.op must be create, update, or delete.")
        String op,
        @NotBlank(message = "command.entity is required.")
        String entity,
        @NotBlank(message = "command.id is required.")
        String id,
        JsonNode data,
        JsonNode patch,
        @NotNull(message = "command.timestamp is required.")
        Long timestamp
) {
}
