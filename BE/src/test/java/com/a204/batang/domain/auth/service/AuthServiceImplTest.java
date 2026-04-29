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
import com.a204.batang.domain.auth.entity.UserType;
import com.a204.batang.domain.auth.repository.MemberRepository;
import com.a204.batang.global.email.EmailService;
import com.a204.batang.global.jwt.JwtUtil;
import com.a204.batang.global.redis.RedisService;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class AuthServiceImplTest {

    @InjectMocks
    private AuthServiceImpl authService;

    @Mock private MemberRepository memberRepository;
    @Mock private JwtUtil jwtUtil;
    @Mock private RedisService redisService;
    @Mock private EmailService emailService;
    @Mock private PasswordEncoder passwordEncoder;

    @Nested
    @DisplayName("이메일 인증 코드 발송")
    class SendEmailCodeCases {

        @Test
        @DisplayName("성공")
        void success() {
            SendEmailCodeRequest request = new SendEmailCodeRequest("test@test.com");
            given(memberRepository.existsByEmailAndStatus("test@test.com", UserStatus.ACTIVE)).willReturn(false);

            SendEmailCodeResponse response = authService.sendEmailCode(request);

            assertThat(response.email()).isEqualTo("test@test.com");
            assertThat(response.expiresIn()).isEqualTo(300);
            verify(redisService).saveEmailCode(eq("test@test.com"), any());
            verify(emailService).sendVerifyCode(eq("test@test.com"), any());
        }

        @Test
        @DisplayName("실패 - 중복 이메일")
        void failDuplicateEmail() {
            SendEmailCodeRequest request = new SendEmailCodeRequest("test@test.com");
            given(memberRepository.existsByEmailAndStatus("test@test.com", UserStatus.ACTIVE)).willReturn(true);

            assertThatThrownBy(() -> authService.sendEmailCode(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("이미 가입된 이메일입니다.");

            verify(redisService, never()).saveEmailCode(any(), any());
            verify(emailService, never()).sendVerifyCode(any(), any());
        }
    }

    @Nested
    @DisplayName("이메일 인증 코드 확인")
    class VerifyEmailCodeCases {

        @Test
        @DisplayName("성공")
        void success() {
            VerifyEmailCodeRequest request = new VerifyEmailCodeRequest("test@test.com", "482910");
            given(redisService.getEmailCode("test@test.com")).willReturn("482910");

            VerifyEmailCodeResponse response = authService.verifyEmailCode(request);

            assertThat(response.verifiedToken()).isNotNull();
            assertThat(response.expiresIn()).isEqualTo(600);
            verify(redisService).deleteEmailCode("test@test.com");
            verify(redisService).saveVerifiedToken(any(), eq("test@test.com"));
        }

        @Test
        @DisplayName("실패 - 만료")
        void failExpiredCode() {
            VerifyEmailCodeRequest request = new VerifyEmailCodeRequest("test@test.com", "482910");
            given(redisService.getEmailCode("test@test.com")).willReturn(null);

            assertThatThrownBy(() -> authService.verifyEmailCode(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("만료된 인증 코드입니다.");
        }

        @Test
        @DisplayName("실패 - 코드 불일치")
        void failWrongCode() {
            VerifyEmailCodeRequest request = new VerifyEmailCodeRequest("test@test.com", "000000");
            given(redisService.getEmailCode("test@test.com")).willReturn("482910");

            assertThatThrownBy(() -> authService.verifyEmailCode(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("인증 코드가 일치하지 않습니다.");
        }
    }

    @Nested
    @DisplayName("회원가입")
    class SignupCases {

        @Test
        @DisplayName("성공 - 회원가입 후 토큰 발급")
        void success() {
            SignupRequest request = new SignupRequest(
                    "test@test.com", "password123!", "테스트", UserType.DESIGNER, "verifiedToken"
            );

            given(redisService.getVerifiedEmail("verifiedToken")).willReturn("test@test.com");
            given(memberRepository.existsByEmailAndStatus("test@test.com", UserStatus.ACTIVE)).willReturn(false);
            given(memberRepository.save(any(Member.class))).willAnswer(invocation -> {
                Member savedMember = invocation.getArgument(0);
                ReflectionTestUtils.setField(savedMember, "userId", UUID.randomUUID());
                return savedMember;
            });
            given(passwordEncoder.encode("password123!")).willReturn("hashedPassword");
            given(jwtUtil.generateAccessToken(any(), any(), any())).willReturn("accessToken");
            given(jwtUtil.generateRefreshToken(any())).willReturn("refreshToken");

            SignupResponse response = authService.signup(request);

            assertThat(response.email()).isEqualTo("test@test.com");
            assertThat(response.accessToken()).isEqualTo("accessToken");
            assertThat(response.refreshToken()).isEqualTo("refreshToken");
            verify(redisService).deleteVerifiedToken("verifiedToken");
            verify(redisService).saveRefreshToken(any(), eq("refreshToken"), anyLong());
        }

        @Test
        @DisplayName("실패 - verifiedToken 만료")
        void failExpiredVerifiedToken() {
            SignupRequest request = new SignupRequest(
                    "test@test.com", "password123!", "테스트", UserType.DESIGNER, "expiredToken"
            );
            given(redisService.getVerifiedEmail("expiredToken")).willReturn(null);

            assertThatThrownBy(() -> authService.signup(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("이메일 인증이 필요합니다.");
        }

        @Test
        @DisplayName("실패 - 이메일 불일치")
        void failEmailMismatch() {
            SignupRequest request = new SignupRequest(
                    "test@test.com", "password123!", "테스트", UserType.DESIGNER, "verifiedToken"
            );
            given(redisService.getVerifiedEmail("verifiedToken")).willReturn("other@test.com");

            assertThatThrownBy(() -> authService.signup(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("이메일이 일치하지 않습니다.");
        }

        @Test
        @DisplayName("실패 - 중복 이메일")
        void failDuplicateEmail() {
            SignupRequest request = new SignupRequest(
                    "test@test.com", "password123!", "테스트", UserType.DESIGNER, "verifiedToken"
            );
            given(redisService.getVerifiedEmail("verifiedToken")).willReturn("test@test.com");
            given(memberRepository.existsByEmailAndStatus("test@test.com", UserStatus.ACTIVE)).willReturn(true);

            assertThatThrownBy(() -> authService.signup(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("이미 가입된 이메일입니다.");
        }
    }

    @Nested
    @DisplayName("로그인")
    class LoginCases {

        @Test
        @DisplayName("성공")
        void success() {
            LoginRequest request = new LoginRequest("test@test.com", "password123!");
            Member member = Member.create("test@test.com", "hashedPassword", "테스트", UserType.DESIGNER);
            ReflectionTestUtils.setField(member, "userId", UUID.randomUUID());

            given(memberRepository.findByEmail("test@test.com")).willReturn(Optional.of(member));
            given(passwordEncoder.matches("password123!", "hashedPassword")).willReturn(true);
            given(jwtUtil.generateAccessToken(any(), any(), any())).willReturn("accessToken");
            given(jwtUtil.generateRefreshToken(any())).willReturn("refreshToken");

            LoginResponse response = authService.login(request);

            assertThat(response.accessToken()).isEqualTo("accessToken");
            assertThat(response.refreshToken()).isEqualTo("refreshToken");
            assertThat(response.user().email()).isEqualTo("test@test.com");
            verify(redisService).saveRefreshToken(any(), eq("refreshToken"), anyLong());
        }

        @Test
        @DisplayName("실패 - 이메일 없음")
        void failEmailNotFound() {
            LoginRequest request = new LoginRequest("notfound@test.com", "password123!");
            given(memberRepository.findByEmail("notfound@test.com")).willReturn(Optional.empty());

            assertThatThrownBy(() -> authService.login(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        @Test
        @DisplayName("실패 - 비밀번호 불일치")
        void failWrongPassword() {
            LoginRequest request = new LoginRequest("test@test.com", "wrongPassword");
            Member member = Member.create("test@test.com", "hashedPassword", "테스트", UserType.DESIGNER);

            given(memberRepository.findByEmail("test@test.com")).willReturn(Optional.of(member));
            given(passwordEncoder.matches("wrongPassword", "hashedPassword")).willReturn(false);

            assertThatThrownBy(() -> authService.login(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        @Test
        @DisplayName("실패 - 탈퇴 회원")
        void failWithdrawnMember() {
            LoginRequest request = new LoginRequest("test@test.com", "password123!");
            Member member = Member.create("test@test.com", "hashedPassword", "테스트", UserType.DESIGNER);
            ReflectionTestUtils.setField(member, "userId", UUID.randomUUID());
            member.deactivate();

            given(memberRepository.findByEmail("test@test.com")).willReturn(Optional.of(member));
            given(passwordEncoder.matches("password123!", "hashedPassword")).willReturn(true);

            assertThatThrownBy(() -> authService.login(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("사용할 수 없는 계정입니다.");
        }
    }

    @Nested
    @DisplayName("토큰 갱신")
    class RefreshCases {

        @Test
        @DisplayName("성공")
        void success() {
            RefreshTokenRequest request = new RefreshTokenRequest("oldRefreshToken");
            String userId = UUID.randomUUID().toString();
            Member member = Member.create("test@test.com", "hashedPassword", "테스트", UserType.DESIGNER);

            Claims claims = mock(Claims.class);
            given(claims.getSubject()).willReturn(userId);
            given(jwtUtil.validateAndGetClaims("oldRefreshToken")).willReturn(claims);
            given(redisService.getRefreshToken(userId)).willReturn("oldRefreshToken");
            given(memberRepository.findById(UUID.fromString(userId))).willReturn(Optional.of(member));
            given(jwtUtil.generateAccessToken(any(), any(), any())).willReturn("newAccessToken");
            given(jwtUtil.generateRefreshToken(any())).willReturn("newRefreshToken");

            RefreshTokenResponse response = authService.refresh(request);

            assertThat(response.accessToken()).isEqualTo("newAccessToken");
            assertThat(response.refreshToken()).isEqualTo("newRefreshToken");
            verify(redisService).deleteRefreshToken(userId);
            verify(redisService).saveRefreshToken(eq(userId), eq("newRefreshToken"), anyLong());
        }

        @Test
        @DisplayName("실패 - Redis에 없음")
        void failTokenNotInRedis() {
            RefreshTokenRequest request = new RefreshTokenRequest("invalidToken");
            String userId = UUID.randomUUID().toString();

            Claims claims = mock(Claims.class);
            given(claims.getSubject()).willReturn(userId);
            given(jwtUtil.validateAndGetClaims("invalidToken")).willReturn(claims);
            given(redisService.getRefreshToken(userId)).willReturn(null);

            assertThatThrownBy(() -> authService.refresh(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("유효하지 않은 Refresh Token입니다.");
        }

        @Test
        @DisplayName("실패 - 토큰 불일치")
        void failTokenMismatch() {
            RefreshTokenRequest request = new RefreshTokenRequest("tokenA");
            String userId = UUID.randomUUID().toString();

            Claims claims = mock(Claims.class);
            given(claims.getSubject()).willReturn(userId);
            given(jwtUtil.validateAndGetClaims("tokenA")).willReturn(claims);
            given(redisService.getRefreshToken(userId)).willReturn("tokenB");

            assertThatThrownBy(() -> authService.refresh(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("유효하지 않은 Refresh Token입니다.");
        }
    }

    @Nested
    @DisplayName("로그아웃")
    class LogoutCases {

        @Test
        @DisplayName("성공")
        void success() {
            String userId = UUID.randomUUID().toString();

            Claims claims = mock(Claims.class);
            given(claims.getSubject()).willReturn(userId);
            given(jwtUtil.validateAndGetClaims("accessToken")).willReturn(claims);
            given(jwtUtil.getRemainingExpiry("accessToken")).willReturn(900000L);

            authService.logout("accessToken");

            verify(redisService).deleteRefreshToken(userId);
            verify(redisService).addToBlacklist("accessToken", 900000L);
        }

        @Test
        @DisplayName("성공 - refresh token 없이 로그아웃")
        void successWithoutRefreshToken() {
            String userId = UUID.randomUUID().toString();

            Claims claims = mock(Claims.class);
            given(claims.getSubject()).willReturn(userId);
            given(jwtUtil.validateAndGetClaims("accessToken")).willReturn(claims);
            given(jwtUtil.getRemainingExpiry("accessToken")).willReturn(900000L);

            authService.logout("accessToken");

            verify(redisService).deleteRefreshToken(userId);
            verify(redisService).addToBlacklist("accessToken", 900000L);
        }
    }

    @Nested
    @DisplayName("내 정보 조회")
    class GetMyInfoCases {

        @Test
        @DisplayName("성공")
        void success() {
            UUID userId = UUID.randomUUID();
            Member member = Member.create("test@test.com", "hashedPassword", "테스트", UserType.DESIGNER);
            given(memberRepository.findById(userId)).willReturn(Optional.of(member));

            MemberInfoResponse response = authService.getMyInfo(userId);

            assertThat(response.email()).isEqualTo("test@test.com");
            assertThat(response.name()).isEqualTo("테스트");
            assertThat(response.userType()).isEqualTo(UserType.DESIGNER);
        }

        @Test
        @DisplayName("실패 - 회원 없음")
        void failMemberNotFound() {
            UUID userId = UUID.randomUUID();
            given(memberRepository.findById(userId)).willReturn(Optional.empty());

            assertThatThrownBy(() -> authService.getMyInfo(userId))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("존재하지 않는 회원입니다.");
        }
    }

    @Nested
    @DisplayName("회원탈퇴")
    class WithdrawCases {

        @Test
        @DisplayName("성공")
        void success() {
            UUID userId = UUID.randomUUID();
            WithdrawRequest request = new WithdrawRequest("password123!");
            Member member = Member.create("test@test.com", "hashedPassword", "테스트", UserType.DESIGNER);
            ReflectionTestUtils.setField(member, "userId", userId);

            given(memberRepository.findById(userId)).willReturn(Optional.of(member));
            given(passwordEncoder.matches("password123!", "hashedPassword")).willReturn(true);
            given(jwtUtil.getRemainingExpiry("accessToken")).willReturn(900000L);

            authService.withdraw(userId, "accessToken", request);

            assertThat(member.getStatus()).isEqualTo(UserStatus.WITHDRAWN);
            verify(redisService).deleteRefreshToken(userId.toString());
            verify(redisService).addToBlacklist("accessToken", 900000L);
        }

        @Test
        @DisplayName("실패 - 회원 없음")
        void failMemberNotFound() {
            UUID userId = UUID.randomUUID();
            WithdrawRequest request = new WithdrawRequest("password123!");
            given(memberRepository.findById(userId)).willReturn(Optional.empty());

            assertThatThrownBy(() -> authService.withdraw(userId, "accessToken", request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("존재하지 않는 회원입니다.");
        }

        @Test
        @DisplayName("실패 - 비밀번호 불일치")
        void failWrongPassword() {
            UUID userId = UUID.randomUUID();
            WithdrawRequest request = new WithdrawRequest("wrongPassword");
            Member member = Member.create("test@test.com", "hashedPassword", "테스트", UserType.DESIGNER);

            given(memberRepository.findById(userId)).willReturn(Optional.of(member));
            given(passwordEncoder.matches("wrongPassword", "hashedPassword")).willReturn(false);

            assertThatThrownBy(() -> authService.withdraw(userId, "accessToken", request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("비밀번호가 올바르지 않습니다.");
        }
    }
}
