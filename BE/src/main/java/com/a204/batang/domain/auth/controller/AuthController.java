package com.a204.batang.domain.auth.controller;

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
import com.a204.batang.domain.auth.service.AuthService;
import com.a204.batang.global.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 이메일 인증, 회원가입, 로그인, 토큰 갱신, 로그아웃, 회원 탈퇴 API를 제공한다.
 */
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;

    /**
     * 이메일 인증 코드를 발송한다.
     *
     * @param request 발송 요청
     * @return 발송 결과
     */
    @PostMapping("/email/send-code")
    public ApiResponse<SendEmailCodeResponse> sendEmailCode(
            @Valid @RequestBody SendEmailCodeRequest request) {
        SendEmailCodeResponse response = authService.sendEmailCode(request);
        return ApiResponse.success("이메일 인증 코드 발송 완료", response);
    }

    /**
     * 이메일 인증 코드를 확인하고 인증 토큰을 발급한다.
     *
     * @param request 확인 요청
     * @return 인증 토큰 응답
     */
    @PostMapping("/email/verify-code")
    public ApiResponse<VerifyEmailCodeResponse> verifyEmailCode(
            @Valid @RequestBody VerifyEmailCodeRequest request) {
        VerifyEmailCodeResponse response = authService.verifyEmailCode(request);
        return ApiResponse.success("이메일 인증 완료", response);
    }

    /**
     * 회원가입을 처리한다.
     *
     * @param request 회원가입 요청
     * @return 회원가입 결과
     */
    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<SignupResponse> signup(
            @Valid @RequestBody SignupRequest request) {
        SignupResponse response = authService.signup(request);
        return ApiResponse.created("회원가입 완료", response);
    }

    /**
     * 이메일과 비밀번호로 로그인한다.
     *
     * @param request 로그인 요청
     * @return 로그인 결과
     */
    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(
            @Valid @RequestBody LoginRequest request) {
        LoginResponse response = authService.login(request);
        return ApiResponse.success("로그인 성공", response);
    }

    /**
     * Refresh Token으로 새 토큰 쌍을 발급한다.
     *
     * @param request 토큰 갱신 요청
     * @return 새 토큰 응답
     */
    @PostMapping("/refresh")
    public ApiResponse<RefreshTokenResponse> refresh(
            @Valid @RequestBody RefreshTokenRequest request) {
        RefreshTokenResponse response = authService.refresh(request);
        return ApiResponse.success("토큰 갱신 완료", response);
    }

    /**
     * Access Token 기준으로 로그아웃을 처리한다.
     *
     * @param bearerToken Authorization 헤더의 Bearer 토큰
     * @return 로그아웃 결과
     */
    @PostMapping("/logout")
    @Operation(summary = "로그아웃", security = @SecurityRequirement(name = "jwtAuth"))
    public ApiResponse<Void> logout(
            @Parameter(hidden = true)
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String bearerToken) {
        String accessToken = extractAccessToken(bearerToken);
        authService.logout(accessToken);
        return ApiResponse.success("로그아웃 완료");
    }

    /**
     * 현재 인증된 회원 정보를 조회한다.
     *
     * @param userId 인증된 회원 ID
     * @return 회원 정보
     */
    @GetMapping("/me")
    public ApiResponse<MemberInfoResponse> getMyInfo(
            @AuthenticationPrincipal UUID userId) {
        MemberInfoResponse response = authService.getMyInfo(userId);
        return ApiResponse.success("회원 정보 조회 성공", response);
    }

    /**
     * 회원 탈퇴를 처리한다.
     *
     * @param userId 인증된 회원 ID
     * @param bearerToken Authorization 헤더의 Bearer 토큰
     * @param request 탈퇴 요청
     * @return 탈퇴 결과
     */
    @DeleteMapping("/me")
    @Operation(summary = "회원 탈퇴", security = @SecurityRequirement(name = "jwtAuth"))
    public ApiResponse<Void> withdraw(
            @AuthenticationPrincipal UUID userId,
            @Parameter(hidden = true)
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String bearerToken,
            @Valid @RequestBody WithdrawRequest request) {
        String accessToken = extractAccessToken(bearerToken);
        authService.withdraw(userId, accessToken, request);
        return ApiResponse.success("회원 탈퇴 완료");
    }

    private String extractAccessToken(String bearerToken) {
        if (bearerToken == null || !bearerToken.startsWith("Bearer ")) {
            throw new IllegalArgumentException("Authorization 헤더가 필요합니다.");
        }
        return bearerToken.substring(7);
    }
}
