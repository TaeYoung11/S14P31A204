package com.a204.batang.domain.pin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 핀 댓글 수정 요청 DTO.
 *
 * @param content 수정할 댓글 본문
 */
public record UpdatePinCommentRequest(
        @NotBlank(message = "content은 필수입니다.")
        @Size(max = 2000, message = "content은 2000자 이하여야 합니다.")
        String content
) {
}
