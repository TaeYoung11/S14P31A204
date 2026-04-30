package com.a204.batang.domain.auth.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * 이메일 인증 코드 확인 요청 DTO.
 *
 * @param email 인증할 이메일
 * @param code 인증 코드
 */
public record VerifyEmailCodeRequest(
        @NotBlank(message = "이메일은 필수입니다.")
        @Email(message = "올바른 이메일 형식이어야 합니다.")
        String email,

        @NotBlank(message = "인증 코드는 필수입니다.")
        String code
) {}
