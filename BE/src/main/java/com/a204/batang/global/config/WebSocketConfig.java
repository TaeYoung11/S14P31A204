package com.a204.batang.global.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

/**
 * 워크스페이스 실시간 동기화를 위한 STOMP 웹소켓 설정이다.
 */
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final StompAuthChannelInterceptor stompAuthChannelInterceptor;

    /**
     * floor-plan snapshot 등 대용량 STOMP payload를 수용하기 위한 메시지 크기 한계.
     * 기본값(64KB)은 layers/walls/openings/ifcElementChanges 누적 시 쉽게 초과되며,
     * 초과 시 WebSocket close code 1009로 연결이 끊겨 publish가 유실된다.
     */
    private static final int STOMP_MESSAGE_SIZE_LIMIT_BYTES = 4 * 1024 * 1024;
    private static final int STOMP_SEND_BUFFER_SIZE_LIMIT_BYTES = 4 * 1024 * 1024;
    private static final int STOMP_SEND_TIME_LIMIT_MS = 20_000;

    /**
     * STOMP 메시지 라우팅 prefix를 설정한다.
     * 클라이언트 발행은 /app, 서버 브로드캐스트 구독은 /topic을 사용한다.
     *
     * @param registry 메시지 브로커 설정 객체
     */
    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
        registry.enableSimpleBroker("/topic", "/queue");
    }

    /**
     * WebSocket transport 단의 메시지/버퍼 한계를 확장한다.
     * floor-plan/update 페이로드는 누적 편집 데이터를 포함해 수백 KB까지 커질 수 있다.
     *
     * @param registration WebSocket transport 설정 객체
     */
    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration.setMessageSizeLimit(STOMP_MESSAGE_SIZE_LIMIT_BYTES);
        registration.setSendBufferSizeLimit(STOMP_SEND_BUFFER_SIZE_LIMIT_BYTES);
        registration.setSendTimeLimit(STOMP_SEND_TIME_LIMIT_MS);
    }

    /**
     * STOMP 클라이언트 연결 엔드포인트를 등록한다.
     *
     * @param registry STOMP 엔드포인트 등록 객체
     */
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws-ifc")
                .setAllowedOriginPatterns("*");
    }

    /**
     * STOMP 인바운드 채널에 인증/인가 인터셉터를 등록한다.
     *
     * @param registration 채널 인터셉터 등록 객체
     */
    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(stompAuthChannelInterceptor);
    }

    /**
     * Tomcat WebSocket container의 메시지 buffer 크기를 확장한다.
     *
     * <p>Spring의 {@link WebSocketTransportRegistration#setMessageSizeLimit}은
     * Spring Framework 단의 STOMP 메시지 재조립 한계만 늘리며, 그 아래에 있는
     * Tomcat {@code WsServerContainer}의 {@code maxTextMessageBufferSize}
     * (기본 8KB)에는 전파되지 않는다. 8KB를 초과하는 텍스트 프레임이 들어오면
     * Tomcat이 WebSocket close code 1009로 연결을 종료한다.
     *
     * @return Tomcat WS container 설정용 팩토리 빈
     */
    @Bean
    public ServletServerContainerFactoryBean createWebSocketContainer() {
        ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(STOMP_MESSAGE_SIZE_LIMIT_BYTES);
        container.setMaxBinaryMessageBufferSize(STOMP_MESSAGE_SIZE_LIMIT_BYTES);
        return container;
    }
}
