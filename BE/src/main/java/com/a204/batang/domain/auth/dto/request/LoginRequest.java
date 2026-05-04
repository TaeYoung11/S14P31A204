package com.a204.batang.domain.auth.dto.request;

import jakarta.validation.constraints.NotBlank;

/**
 * 로그인 요청 DTO.
 *
 * @param email 이메일
 * @param password 비밀번호
 */
public record LoginRequest(
        @NotBlank(message = "이메일은 필수입니다.")
        String email,

        @NotBlank(message = "비밀번호는 필수입니다.")
        String password
) {}
