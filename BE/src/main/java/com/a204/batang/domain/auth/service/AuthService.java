package com.a204.batang.domain.auth.service;

import com.a204.batang.domain.auth.dto.request.LoginRequest;
import com.a204.batang.domain.auth.dto.request.RefreshTokenRequest;
import com.a204.batang.domain.auth.dto.request.SendEmailCodeRequest;
import com.a204.batang.domain.auth.dto.request.SignupRequest;
import com.a204.batang.domain.auth.dto.request.VerifyEmailCodeRequest;
import com.a204.batang.domain.auth.dto.request.WithdrawRequest;
import com.a204.batang.domain.auth.dto.response.LoginResponse;
import com.a204.batang.domain.auth.dto.response.MemberInfoResponse;
import com.a204.batang.domain.auth.dto.response.RefreshTokenResponse;
import com.a204.batang.domain.auth.dto.response.SendEmailCodeResponse;
import com.a204.batang.domain.auth.dto.response.SignupResponse;
import com.a204.batang.domain.auth.dto.response.VerifyEmailCodeResponse;

import java.util.UUID;

/**
 * 인증/회원 관련 비즈니스 로직을 정의하는 서비스 인터페이스다.
 */
public interface AuthService {

    /**
     * 이메일 인증 코드를 발송한다.
     *
     * @param request 발송 요청
     * @return 발송 결과
     */
    SendEmailCodeResponse sendEmailCode(SendEmailCodeRequest request);

    /**
     * 이메일 인증 코드를 확인하고 인증 토큰을 발급한다.
     *
     * @param request 확인 요청
     * @return 인증 토큰 응답
     */
    VerifyEmailCodeResponse verifyEmailCode(VerifyEmailCodeRequest request);

    /**
     * 회원가입을 처리하고 토큰을 발급한다.
     *
     * @param request 회원가입 요청
     * @return 회원가입 결과
     */
    SignupResponse signup(SignupRequest request);

    /**
     * 이메일과 비밀번호로 로그인한다.
     *
     * @param request 로그인 요청
     * @return 로그인 결과
     */
    LoginResponse login(LoginRequest request);

    /**
     * Refresh Token으로 새 토큰 쌍을 발급한다.
     *
     * @param request 토큰 갱신 요청
     * @return 새 토큰 응답
     */
    RefreshTokenResponse refresh(RefreshTokenRequest request);

    /**
     * Access Token 기준으로 로그아웃을 처리한다.
     *
     * @param accessToken 현재 Access Token
     */
    void logout(String accessToken);

    /**
     * 현재 인증된 회원 정보를 조회한다.
     *
     * @param userId 회원 ID
     * @return 회원 정보
     */
    MemberInfoResponse getMyInfo(UUID userId);

    /**
     * 회원 탈퇴를 처리한다.
     *
     * @param userId 회원 ID
     * @param accessToken 현재 Access Token
     * @param request 탈퇴 요청
     */
    void withdraw(UUID userId, String accessToken, WithdrawRequest request);
}
