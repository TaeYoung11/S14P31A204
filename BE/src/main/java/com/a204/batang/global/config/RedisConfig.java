package com.a204.batang.global.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.StringRedisSerializer;

/**
 * Redis 연결 및 직렬화 방식을 설정한다.
 * 키/값 모두 문자열 직렬화를 사용해 범용 역직렬화 공격면을 줄인다.
 */
@Configuration
public class RedisConfig {

    /**
     * RedisTemplate 기본 빈을 등록한다.
     * 현재 undo/redo 시나리오에서 문자열(URL/리비전/커서) 중심으로 저장하므로
     * 값 직렬화도 String으로 고정해 안전성과 단순성을 우선한다.
     *
     * @param connectionFactory Redis 연결 팩토리
     * @return 설정된 RedisTemplate
     */
    @Bean
    public RedisTemplate<String, String> redisTemplate(RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, String> redisTemplate = new RedisTemplate<>();

        StringRedisSerializer keySerializer = new StringRedisSerializer();
        StringRedisSerializer valueSerializer = new StringRedisSerializer();

        redisTemplate.setConnectionFactory(connectionFactory);
        redisTemplate.setKeySerializer(keySerializer);
        redisTemplate.setHashKeySerializer(keySerializer);
        redisTemplate.setValueSerializer(valueSerializer);
        redisTemplate.setHashValueSerializer(valueSerializer);
        redisTemplate.afterPropertiesSet();

        return redisTemplate;
    }
}
