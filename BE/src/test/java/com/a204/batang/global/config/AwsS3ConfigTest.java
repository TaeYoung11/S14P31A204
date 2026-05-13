package com.a204.batang.global.config;

import com.a204.batang.global.exception.ErrorCode;
import com.a204.batang.global.storage.S3ObjectPresigner;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;

class AwsS3ConfigTest {

    @Test
    void s3Presigner_usesPublicEndpointForPresignedUrls() {
        withAwsSystemCredentials(() -> {
            AwsS3Config config = new AwsS3Config();

            try (S3Presigner s3Presigner = config.s3Presigner(
                    "us-east-1",
                    "http://minio:9000",
                    "http://localhost:9000"
            )) {
                S3ObjectPresigner objectPresigner = new S3ObjectPresigner(
                        s3Presigner,
                        "batang-artifacts",
                        "http://minio:9000",
                        300L
                );

                String presignedUrl = objectPresigner.presignRequired(
                        "projects/project-1/revisions/revision-1/ifc/model.v1.ifc",
                        ErrorCode.WORKSPACE_IFC_EXPORT_PRESIGN_FAILED
                );

                URI uri = URI.create(presignedUrl);
                assertThat(uri.getHost()).isEqualTo("localhost");
                assertThat(uri.getPort()).isEqualTo(9000);
                assertThat(uri.getPath())
                        .isEqualTo("/batang-artifacts/projects/project-1/revisions/revision-1/ifc/model.v1.ifc");
            }
        });
    }

    @Test
    void s3Presigner_fallsBackToInternalEndpointWhenPublicEndpointIsBlank() {
        withAwsSystemCredentials(() -> {
            AwsS3Config config = new AwsS3Config();

            try (S3Presigner s3Presigner = config.s3Presigner(
                    "us-east-1",
                    "http://minio:9000",
                    " "
            )) {
                S3ObjectPresigner objectPresigner = new S3ObjectPresigner(
                        s3Presigner,
                        "batang-artifacts",
                        "http://minio:9000",
                        300L
                );

                String presignedUrl = objectPresigner.presignRequired(
                        "projects/project-1/revisions/revision-1/ifc/model.v1.ifc",
                        ErrorCode.WORKSPACE_IFC_EXPORT_PRESIGN_FAILED
                );

                URI uri = URI.create(presignedUrl);
                assertThat(uri.getHost()).isEqualTo("minio");
                assertThat(uri.getPort()).isEqualTo(9000);
            }
        });
    }

    private void withAwsSystemCredentials(Runnable assertion) {
        String previousAccessKeyId = System.getProperty("aws.accessKeyId");
        String previousSecretAccessKey = System.getProperty("aws.secretAccessKey");
        try {
            System.setProperty("aws.accessKeyId", "minio");
            System.setProperty("aws.secretAccessKey", "minio123");
            assertion.run();
        } finally {
            restoreSystemProperty("aws.accessKeyId", previousAccessKeyId);
            restoreSystemProperty("aws.secretAccessKey", previousSecretAccessKey);
        }
    }

    private void restoreSystemProperty(String key, String previousValue) {
        if (previousValue == null) {
            System.clearProperty(key);
            return;
        }
        System.setProperty(key, previousValue);
    }
}
