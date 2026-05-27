package com.a204.batang.domain.pin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 핀 댓글 생성 요청 DTO다.
 *
 * @param content 댓글 본문
 */
public record CreatePinCommentRequest(
        @NotBlank(message = "content는 필수입니다.")
        @Size(max = 2000, message = "content는 2000자 이하여야 합니다.")
        String content
) {
}
