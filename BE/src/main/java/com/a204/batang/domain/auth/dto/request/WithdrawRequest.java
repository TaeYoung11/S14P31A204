package com.a204.batang.domain.auth.dto.request;

import jakarta.validation.constraints.NotBlank;

/**
 * 회원 탈퇴 요청 DTO.
 *
 * @param password 현재 비밀번호
 */
public record WithdrawRequest(
        @NotBlank(message = "비밀번호는 필수입니다.")
        String password
) {}
