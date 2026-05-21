package com.a204.batang.domain.project.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 프로젝트 카드 썸네일 갱신 요청 DTO.
 *
 * @param thumbnailUrl 브라우저에서 표시 가능한 이미지 URL
 * @param thumbnailMode 썸네일이 캡처된 에디터 모드
 */
public record UpdateProjectThumbnailRequest(
        @NotBlank(message = "thumbnailUrl은 필수 입력값입니다.")
        String thumbnailUrl,
        @NotBlank(message = "thumbnailMode는 필수 입력값입니다.")
        String thumbnailMode
) {
}
