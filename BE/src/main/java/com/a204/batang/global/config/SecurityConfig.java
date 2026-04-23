package com.a204.batang.global.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

/**
 * 현재 인증/회원 기능이 미구현 상태이므로 API를 임시로 모두 열어두는 보안 설정이다.
 * 추후 인증 도입 시 엔드포인트별 권한 정책으로 전환한다.
 */
@Configuration
public class SecurityConfig {

    /**
     * 애플리케이션의 HTTP 보안 정책을 정의한다.
     *
     * @param http HttpSecurity 객체
     * @return 구성된 SecurityFilterChain
     * @throws Exception 보안 설정 중 예외가 발생한 경우
     */
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                "/swagger-ui.html",
                                "/swagger-ui/**",
                                "/v3/api-docs/**"
                        ).permitAll()
                        // TODO: 회원/인증 기능 도입 후 프로젝트별 권한 체크로 전환
                        .anyRequest().permitAll()
                )
                .httpBasic(Customizer.withDefaults());

        return http.build();
    }
}
