package com.a204.batang.global.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/**
 * AWS S3 Presigner 빈 설정.
 */
@Configuration
public class AwsS3Config {

    /**
     * presigned URL 발급에 사용할 S3Presigner를 생성한다.
     *
     * @param region AWS 리전
     * @return S3Presigner 빈
     */
    @Bean
    public S3Presigner s3Presigner(@Value("${app.aws.region}") String region) {
        S3Presigner.Builder builder = S3Presigner.builder();
        if (StringUtils.hasText(region)) {
            builder.region(Region.of(region.trim()));
        }
        return builder.build();
    }
}
