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
import com.a204.batang.domain.auth.entity.Member;
import com.a204.batang.domain.auth.entity.UserStatus;
import com.a204.batang.domain.auth.repository.MemberRepository;
import com.a204.batang.global.email.EmailService;
import com.a204.batang.global.jwt.JwtUtil;
import com.a204.batang.global.redis.RedisService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.UUID;

/**
 * 인증/회원 비즈니스 로직을 처리하는 서비스다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private static final long REFRESH_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000L;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final MemberRepository memberRepository;
    private final JwtUtil jwtUtil;
    private final RedisService redisService;
    private final EmailService emailService;
    private final PasswordEncoder passwordEncoder;

    /**
     * 이메일 인증 코드를 생성하여 Redis에 저장하고 발송한다.
     *
     * @param request 발송 요청
     * @return 발송 결과
     */
    @Override
    @Transactional(readOnly = true)
    public SendEmailCodeResponse sendEmailCode(SendEmailCodeRequest request) {
        if (memberRepository.existsByEmailAndStatus(request.email(), UserStatus.ACTIVE)) {
            throw new IllegalArgumentException("이미 가입된 이메일입니다.");
        }

        String code = String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
        redisService.saveEmailCode(request.email(), code);
        emailService.sendVerifyCode(request.email(), code);

        log.info("이메일 인증 코드 발송 완료. email={}", request.email());
        return new SendEmailCodeResponse(request.email(), 300);
    }

    /**
     * 인증 코드를 검증하고 회원가입에 사용할 verifiedToken을 발급한다.
     *
     * @param request 확인 요청
     * @return 인증 토큰 응답
     */
    @Override
    public VerifyEmailCodeResponse verifyEmailCode(VerifyEmailCodeRequest request) {
        String savedCode = redisService.getEmailCode(request.email());
        if (savedCode == null) {
            throw new IllegalArgumentException("만료된 인증 코드입니다.");
        }
        if (!savedCode.equals(request.code())) {
            throw new IllegalArgumentException("인증 코드가 일치하지 않습니다.");
        }

        redisService.deleteEmailCode(request.email());

        String verifiedToken = UUID.randomUUID().toString();
        redisService.saveVerifiedToken(verifiedToken, request.email());

        return new VerifyEmailCodeResponse(verifiedToken, 600);
    }

    /**
     * 회원가입을 처리하고 자동 로그인 토큰을 발급한다.
     *
     * @param request 회원가입 요청
     * @return 회원가입 결과
     */
    @Override
    @Transactional
    public SignupResponse signup(SignupRequest request) {
        String verifiedEmail = redisService.getVerifiedEmail(request.verifiedToken());
        if (verifiedEmail == null) {
            throw new IllegalArgumentException("이메일 인증이 필요합니다.");
        }
        if (!verifiedEmail.equals(request.email())) {
            throw new IllegalArgumentException("이메일이 일치하지 않습니다.");
        }
        if (memberRepository.existsByEmailAndStatus(request.email(), UserStatus.ACTIVE)) {
            throw new IllegalArgumentException("이미 가입된 이메일입니다.");
        }

        String passwordHash = passwordEncoder.encode(request.password());
        Member member = Member.create(request.email(), passwordHash, request.name(), request.userType());
        memberRepository.save(member);

        redisService.deleteVerifiedToken(request.verifiedToken());

        String accessToken = jwtUtil.generateAccessToken(
                member.getUserId().toString(), member.getEmail(), member.getUserType().name());
        String refreshToken = jwtUtil.generateRefreshToken(member.getUserId().toString());
        redisService.saveRefreshToken(member.getUserId().toString(), refreshToken, REFRESH_TOKEN_TTL_MS);

        log.info("회원가입 완료. userId={}", member.getUserId());
        return new SignupResponse(
                member.getUserId(), member.getEmail(), member.getName(),
                member.getUserType(), accessToken, refreshToken);
    }

    /**
     * 이메일과 비밀번호를 검증하고 토큰을 발급한다.
     *
     * @param request 로그인 요청
     * @return 로그인 결과
     */
    @Override
    @Transactional
    public LoginResponse login(LoginRequest request) {
        Member member = memberRepository.findByEmail(request.email())
                .orElseThrow(() -> new IllegalArgumentException("이메일 또는 비밀번호가 올바르지 않습니다."));

        if (!passwordEncoder.matches(request.password(), member.getPasswordHash())) {
            throw new IllegalArgumentException("이메일 또는 비밀번호가 올바르지 않습니다.");
        }
        if (member.getStatus() != UserStatus.ACTIVE) {
            throw new IllegalArgumentException("사용할 수 없는 계정입니다.");
        }

        String accessToken = jwtUtil.generateAccessToken(
                member.getUserId().toString(), member.getEmail(), member.getUserType().name());
        String refreshToken = jwtUtil.generateRefreshToken(member.getUserId().toString());
        redisService.saveRefreshToken(member.getUserId().toString(), refreshToken, REFRESH_TOKEN_TTL_MS);

        member.updateLastLoginAt();

        log.info("로그인 완료. userId={}", member.getUserId());
        return new LoginResponse(
                accessToken,
                refreshToken,
                new LoginResponse.UserInfo(
                        member.getUserId(), member.getEmail(),
                        member.getName(), member.getUserType()));
    }

    /**
     * Refresh Token을 검증하고 새 토큰 쌍을 발급한다.
     *
     * @param request 토큰 갱신 요청
     * @return 새 토큰 응답
     */
    @Override
    @Transactional(readOnly = true)
    public RefreshTokenResponse refresh(RefreshTokenRequest request) {
        String userId = jwtUtil.validateAndGetClaims(request.refreshToken()).getSubject();

        String savedToken = redisService.getRefreshToken(userId);
        if (savedToken == null || !savedToken.equals(request.refreshToken())) {
            throw new IllegalArgumentException("유효하지 않은 Refresh Token입니다.");
        }

        Member member = memberRepository.findById(UUID.fromString(userId))
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 회원입니다."));

        redisService.deleteRefreshToken(userId);

        String newAccessToken = jwtUtil.generateAccessToken(
                userId, member.getEmail(), member.getUserType().name());
        String newRefreshToken = jwtUtil.generateRefreshToken(userId);
        redisService.saveRefreshToken(userId, newRefreshToken, REFRESH_TOKEN_TTL_MS);

        return new RefreshTokenResponse(newAccessToken, newRefreshToken, 900, 1209600);
    }

    /**
     * Access Token 기준으로 현재 세션을 로그아웃 처리한다.
     *
     * @param accessToken 현재 Access Token
     */
    @Override
    public void logout(String accessToken) {
        String userId = jwtUtil.validateAndGetClaims(accessToken).getSubject();

        redisService.deleteRefreshToken(userId);

        long remainingMs = jwtUtil.getRemainingExpiry(accessToken);
        redisService.addToBlacklist(accessToken, remainingMs);

        log.info("로그아웃 완료. userId={}", userId);
    }

    /**
     * 회원 정보를 조회한다.
     *
     * @param userId 회원 ID
     * @return 회원 정보
     */
    @Override
    @Transactional(readOnly = true)
    public MemberInfoResponse getMyInfo(UUID userId) {
        Member member = memberRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 회원입니다."));

        return new MemberInfoResponse(
                member.getUserId(), member.getEmail(),
                member.getName(), member.getUserType());
    }

    /**
     * 비밀번호를 검증하고 회원을 탈퇴 처리한다.
     *
     * @param userId 회원 ID
     * @param accessToken 현재 Access Token
     * @param request 탈퇴 요청
     */
    @Override
    @Transactional
    public void withdraw(UUID userId, String accessToken, WithdrawRequest request) {
        Member member = memberRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 회원입니다."));

        if (!passwordEncoder.matches(request.password(), member.getPasswordHash())) {
            throw new IllegalArgumentException("비밀번호가 올바르지 않습니다.");
        }

        redisService.deleteRefreshToken(userId.toString());

        long remainingMs = jwtUtil.getRemainingExpiry(accessToken);
        redisService.addToBlacklist(accessToken, remainingMs);

        member.deactivate();

        log.info("회원 탈퇴 완료. userId={}", userId);
    }
}
