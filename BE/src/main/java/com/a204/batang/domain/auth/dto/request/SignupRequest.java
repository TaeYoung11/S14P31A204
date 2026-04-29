package com.a204.batang.domain.auth.dto.request;

import com.a204.batang.domain.auth.entity.UserType;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 회원가입 요청 DTO.
 *
 * @param email 이메일
 * @param password 비밀번호
 * @param name 이름
 * @param userType 회원 유형
 * @param verifiedToken 이메일 인증 토큰
 */
public record SignupRequest(
        @NotBlank(message = "이메일은 필수입니다.")
        @Email(message = "올바른 이메일 형식이어야 합니다.")
        String email,

        @NotBlank(message = "비밀번호는 필수입니다.")
        @Size(min = 8, message = "비밀번호는 8자 이상이어야 합니다.")
        String password,

        @NotBlank(message = "이름은 필수입니다.")
        String name,

        @NotNull(message = "사용자 유형은 필수입니다.")
        UserType userType,

        @NotBlank(message = "이메일 인증 토큰은 필수입니다.")
        String verifiedToken
) {}
