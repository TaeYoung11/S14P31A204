package com.a204.batang.domain.workspace.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record WorkspaceCommandMeta(
        @NotBlank(message = "meta.source is required.")
        @Pattern(regexp = "2d|3d", message = "meta.source must be 2d or 3d.")
        String source,
        @NotBlank(message = "meta.clientId is required.")
        String clientId,
        String userId,
        @NotBlank(message = "meta.createdAt is required.")
        String createdAt
) {
}
