package com.a204.batang.global.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.net.URI;

/**
 * AWS S3 client와 presigner 빈을 설정한다.
 */
@Configuration
public class AwsS3Config {

    /**
     * presigned URL 발급에 사용할 S3Presigner를 생성한다.
     *
     * <p>로컬 Docker 환경에서는 backend 내부 접근 endpoint와 브라우저 접근 endpoint가 다를 수 있다.
     * 이 경우 presigner는 브라우저가 접근 가능한 public endpoint를 우선 사용한다.
     *
     * @param region AWS 리전
     * @param endpointUrl backend 내부 S3 endpoint URL
     * @param publicEndpointUrl 브라우저에 노출할 presigned URL endpoint
     * @return S3Presigner 빈
     */
    @Bean
    public S3Presigner s3Presigner(
            @Value("${app.aws.region}") String region,
            @Value("${app.aws.s3.endpoint-url:}") String endpointUrl,
            @Value("${app.aws.s3.public-endpoint-url:}") String publicEndpointUrl
    ) {
        String presignerEndpointUrl = resolvePresignerEndpointUrl(publicEndpointUrl, endpointUrl);
        S3Presigner.Builder builder = S3Presigner.builder()
                .serviceConfiguration(buildS3Configuration(presignerEndpointUrl));
        if (StringUtils.hasText(region)) {
            builder.region(Region.of(region.trim()));
        }
        if (StringUtils.hasText(presignerEndpointUrl)) {
            builder.endpointOverride(URI.create(presignerEndpointUrl.trim()));
        }
        return builder.build();
    }

    /**
     * S3 객체 접근에 사용할 S3Client 빈을 생성한다.
     *
     * @param region AWS 리전
     * @param endpointUrl backend 내부 S3 endpoint URL
     * @return S3Client 빈
     */
    @Bean
    public S3Client s3Client(
            @Value("${app.aws.region}") String region,
            @Value("${app.aws.s3.endpoint-url:}") String endpointUrl
    ) {
        var builder = S3Client.builder()
                .serviceConfiguration(buildS3Configuration(endpointUrl));
        if (StringUtils.hasText(region)) {
            builder.region(Region.of(region.trim()));
        }
        if (StringUtils.hasText(endpointUrl)) {
            builder.endpointOverride(URI.create(endpointUrl.trim()));
        }
        return builder.build();
    }

    private String resolvePresignerEndpointUrl(String publicEndpointUrl, String fallbackEndpointUrl) {
        if (StringUtils.hasText(publicEndpointUrl)) {
            return publicEndpointUrl.trim();
        }
        return StringUtils.hasText(fallbackEndpointUrl) ? fallbackEndpointUrl.trim() : "";
    }

    private S3Configuration buildS3Configuration(String endpointUrl) {
        if (StringUtils.hasText(endpointUrl)) {
            return S3Configuration.builder()
                    .pathStyleAccessEnabled(true)
                    .build();
        }
        return S3Configuration.builder().build();
    }
}
