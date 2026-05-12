package com.a204.batang.domain.project.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * 프로젝트 멤버 초대 요청 DTO.
 *
 * @param inviteeEmail 초대할 사용자 이메일
 */
public record ProjectInvitationRequest(
        @NotBlank(message = "inviteeEmail은 필수입니다.")
        @Email(message = "inviteeEmail은 올바른 이메일 형식이어야 합니다.")
        String inviteeEmail
) {
}
