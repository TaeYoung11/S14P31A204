package com.a204.batang.global.storage;

import com.a204.batang.global.exception.CustomException;
import com.a204.batang.global.exception.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Duration;
import java.util.Locale;

@Component
public class S3ObjectPresigner {

    private static final String S3_SCHEME_PREFIX = "s3://";
    private static final String HTTP_SCHEME = "http";
    private static final String HTTPS_SCHEME = "https";
    private static final String HTTP_PREFIX = "http://";
    private static final String HTTPS_PREFIX = "https://";
    private static final long FALLBACK_PRESIGN_EXPIRATION_SECONDS = 300L;

    private final S3Presigner s3Presigner;
    private final String configuredBucket;
    private final URI configuredEndpointUri;
    private final long presignExpirationSeconds;

    public S3ObjectPresigner(
            S3Presigner s3Presigner,
            @Value("${app.aws.s3.bucket}") String configuredBucket,
            @Value("${app.aws.s3.endpoint-url:}") String endpointUrl,
            @Value("${app.aws.s3.presign-expiration-seconds}") long presignExpirationSeconds
    ) {
        this.s3Presigner = s3Presigner;
        this.configuredBucket = configuredBucket == null ? "" : configuredBucket.trim();
        this.configuredEndpointUri = parseConfiguredEndpointUri(endpointUrl);
        this.presignExpirationSeconds = presignExpirationSeconds;
    }

    public String presignRequired(String storageUrl, ErrorCode errorCode) {
        try {
            S3ObjectLocation objectLocation = resolveS3ObjectLocation(storageUrl);
            GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                    .bucket(objectLocation.bucket())
                    .key(objectLocation.key())
                    .build();
            GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                    .signatureDuration(resolveSignatureDuration())
                    .getObjectRequest(getObjectRequest)
                    .build();

            return s3Presigner.presignGetObject(presignRequest).url().toString();
        } catch (CustomException exception) {
            throw new CustomException(errorCode);
        } catch (RuntimeException exception) {
            throw new CustomException(errorCode);
        }
    }

    public String presignIfInternal(String storageUrl, ErrorCode errorCode) {
        if (!StringUtils.hasText(storageUrl)) {
            return storageUrl;
        }

        String normalizedStorageUrl = storageUrl.trim();
        if (!isInternalStorageUrl(normalizedStorageUrl)) {
            return storageUrl;
        }

        return presignRequired(normalizedStorageUrl, errorCode);
    }

    private boolean isInternalStorageUrl(String storageUrl) {
        if (storageUrl.startsWith(S3_SCHEME_PREFIX)) {
            return true;
        }
        if (!storageUrl.startsWith(HTTP_PREFIX) && !storageUrl.startsWith(HTTPS_PREFIX)) {
            return true;
        }

        URI uri;
        try {
            uri = new URI(storageUrl);
        } catch (URISyntaxException exception) {
            return false;
        }

        String host = uri.getHost();
        if (!StringUtils.hasText(host)) {
            return false;
        }

        String normalizedHost = host.toLowerCase(Locale.ROOT);
        return matchesConfiguredEndpoint(uri)
                || normalizedHost.indexOf(".s3.") > 0
                || normalizedHost.equals("s3.amazonaws.com")
                || normalizedHost.startsWith("s3.")
                || normalizedHost.startsWith("s3-");
    }

    private Duration resolveSignatureDuration() {
        if (presignExpirationSeconds <= 0) {
            return Duration.ofSeconds(FALLBACK_PRESIGN_EXPIRATION_SECONDS);
        }
        return Duration.ofSeconds(presignExpirationSeconds);
    }

    private S3ObjectLocation resolveS3ObjectLocation(String storageUrl) {
        if (!StringUtils.hasText(storageUrl)) {
            throw new CustomException(ErrorCode.INVALID_REQUEST);
        }

        String normalizedStorageUrl = storageUrl.trim();
        if (normalizedStorageUrl.startsWith(S3_SCHEME_PREFIX)) {
            return resolveS3SchemeLocation(normalizedStorageUrl);
        }
        if (normalizedStorageUrl.startsWith(HTTP_PREFIX) || normalizedStorageUrl.startsWith(HTTPS_PREFIX)) {
            return resolveHttpLocation(normalizedStorageUrl);
        }
        return resolveObjectKeyLocation(normalizedStorageUrl);
    }

    private S3ObjectLocation resolveS3SchemeLocation(String s3Url) {
        String withoutScheme = s3Url.substring(S3_SCHEME_PREFIX.length());
        int separatorIndex = withoutScheme.indexOf('/');
        if (separatorIndex <= 0 || separatorIndex >= withoutScheme.length() - 1) {
            throw new CustomException(ErrorCode.INVALID_REQUEST);
        }

        String bucket = withoutScheme.substring(0, separatorIndex).trim();
        String key = withoutScheme.substring(separatorIndex + 1).trim();
        return new S3ObjectLocation(validateBucketOrThrow(bucket), validateKeyOrThrow(key));
    }

    private S3ObjectLocation resolveHttpLocation(String httpUrl) {
        URI uri;
        try {
            uri = new URI(httpUrl);
        } catch (URISyntaxException exception) {
            throw new CustomException(ErrorCode.INVALID_REQUEST);
        }

        String host = uri.getHost();
        String rawPath = uri.getPath();
        if (!StringUtils.hasText(host) || !StringUtils.hasText(rawPath) || "/".equals(rawPath)) {
            throw new CustomException(ErrorCode.INVALID_REQUEST);
        }

        String normalizedHost = host.toLowerCase(Locale.ROOT);
        String normalizedPath = stripLeadingSlash(rawPath);

        if (matchesConfiguredEndpoint(uri)) {
            return resolvePathStyleLocation(normalizedPath);
        }

        int virtualHostedIndex = normalizedHost.indexOf(".s3.");
        if (virtualHostedIndex > 0) {
            String bucket = host.substring(0, virtualHostedIndex).trim();
            return new S3ObjectLocation(validateBucketOrThrow(bucket), validateKeyOrThrow(normalizedPath));
        }

        if (normalizedHost.equals("s3.amazonaws.com")
                || normalizedHost.startsWith("s3.")
                || normalizedHost.startsWith("s3-")) {
            return resolvePathStyleLocation(normalizedPath);
        }

        throw new CustomException(ErrorCode.INVALID_REQUEST);
    }

    private S3ObjectLocation resolvePathStyleLocation(String normalizedPath) {
        int separatorIndex = normalizedPath.indexOf('/');
        if (separatorIndex <= 0 || separatorIndex >= normalizedPath.length() - 1) {
            throw new CustomException(ErrorCode.INVALID_REQUEST);
        }

        String bucket = normalizedPath.substring(0, separatorIndex).trim();
        String key = normalizedPath.substring(separatorIndex + 1).trim();
        return new S3ObjectLocation(validateBucketOrThrow(bucket), validateKeyOrThrow(key));
    }

    private URI parseConfiguredEndpointUri(String endpointUrl) {
        if (!StringUtils.hasText(endpointUrl)) {
            return null;
        }
        return URI.create(endpointUrl.trim());
    }

    private boolean matchesConfiguredEndpoint(URI uri) {
        if (configuredEndpointUri == null
                || !StringUtils.hasText(configuredEndpointUri.getHost())
                || !StringUtils.hasText(uri.getHost())) {
            return false;
        }

        return configuredEndpointUri.getHost().equalsIgnoreCase(uri.getHost())
                && resolveEffectivePort(configuredEndpointUri) == resolveEffectivePort(uri);
    }

    private int resolveEffectivePort(URI uri) {
        if (uri.getPort() >= 0) {
            return uri.getPort();
        }
        if (HTTPS_SCHEME.equalsIgnoreCase(uri.getScheme())) {
            return 443;
        }
        if (HTTP_SCHEME.equalsIgnoreCase(uri.getScheme())) {
            return 80;
        }
        return -1;
    }

    private S3ObjectLocation resolveObjectKeyLocation(String keyOnlyPath) {
        if (!StringUtils.hasText(configuredBucket)) {
            throw new CustomException(ErrorCode.INVALID_REQUEST);
        }
        return new S3ObjectLocation(configuredBucket, validateKeyOrThrow(keyOnlyPath.trim()));
    }

    private String validateBucketOrThrow(String bucket) {
        if (!StringUtils.hasText(bucket)) {
            throw new CustomException(ErrorCode.INVALID_REQUEST);
        }

        String normalizedBucket = bucket.trim();
        if (!StringUtils.hasText(configuredBucket)) {
            return normalizedBucket;
        }
        if (!configuredBucket.equals(normalizedBucket)) {
            throw new CustomException(ErrorCode.INVALID_REQUEST);
        }
        return normalizedBucket;
    }

    private String validateKeyOrThrow(String key) {
        String normalizedKey = stripLeadingSlash(key);
        if (!StringUtils.hasText(normalizedKey)) {
            throw new CustomException(ErrorCode.INVALID_REQUEST);
        }
        return normalizedKey;
    }

    private String stripLeadingSlash(String value) {
        String normalizedValue = value;
        while (normalizedValue.startsWith("/")) {
            normalizedValue = normalizedValue.substring(1);
        }
        return normalizedValue;
    }

    private record S3ObjectLocation(String bucket, String key) {
    }
}
