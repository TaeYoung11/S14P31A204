package com.a204.batang.domain.project.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/**
 * 프로젝트 다건 삭제 요청 DTO.
 *
 * @param projectIds 삭제할 프로젝트 ID 목록
 */
public record DeleteProjectsRequest(
        @NotEmpty(message = "projectIds는 1개 이상이어야 합니다.")
        @Size(max = 100, message = "한 번에 삭제할 수 있는 프로젝트는 최대 100개입니다.")
        List<@NotNull(message = "projectIds 항목은 null일 수 없습니다.") UUID> projectIds
) {
}
