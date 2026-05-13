package com.a204.batang.domain.workspace.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.util.UUID;

public record WorkspaceCommandEnvelope(
        @NotBlank(message = "type is required.")
        @Pattern(regexp = "command", message = "type must be command.")
        String type,
        @NotBlank(message = "schemaVersion is required.")
        @Pattern(regexp = "v1", message = "schemaVersion must be v1.")
        String schemaVersion,
        @NotNull(message = "commandId is required.")
        UUID commandId,
        @NotNull(message = "projectId is required.")
        UUID projectId,
        @NotNull(message = "baseRevisionId is required.")
        UUID baseRevisionId,
        @NotNull(message = "baseIndex is required.")
        @Min(value = -1, message = "baseIndex must be greater than or equal to -1.")
        Integer baseIndex,
        @Valid
        @NotNull(message = "command is required.")
        WorkspaceCommand command,
        @Valid
        @NotNull(message = "meta is required.")
        WorkspaceCommandMeta meta
) {
}
