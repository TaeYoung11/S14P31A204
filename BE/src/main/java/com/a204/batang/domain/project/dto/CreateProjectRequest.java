package com.a204.batang.domain.project.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 새 프로젝트 생성 요청 DTO.
 *
 * @param name 프로젝트 이름
 * @param description 프로젝트 설명
 * @param primaryClientId 고객사 ID(회원/고객사 기능 미구현으로 현재는 저장하지 않음)
 */
public record CreateProjectRequest(
        @NotBlank(message = "name은 필수입니다.")
        @Size(max = 100, message = "name은 100자 이하여야 합니다.")
        String name,

        @Size(max = 1000, message = "description은 1000자 이하여야 합니다.")
        String description,

        @Size(max = 36, message = "primaryClientId는 UUID 형식이어야 합니다.")
        String primaryClientId
) {
}