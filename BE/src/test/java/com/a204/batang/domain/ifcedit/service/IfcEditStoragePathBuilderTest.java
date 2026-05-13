package com.a204.batang.domain.ifcedit.service;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class IfcEditStoragePathBuilderTest {

    private final IfcEditStoragePathBuilder builder = new IfcEditStoragePathBuilder("batang-artifacts");

    @Test
    void buildSourceIfcStorageUrl_returnsExpectedPath() {
        UUID projectId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID revisionId = UUID.fromString("22222222-2222-2222-2222-222222222222");

        String path = builder.buildSourceIfcStorageUrl(projectId, revisionId);

        assertThat(path).isEqualTo("s3://batang-artifacts/projects/11111111-1111-1111-1111-111111111111/revisions/22222222-2222-2222-2222-222222222222/ifc/model.v1.ifc");
    }

    @Test
    void buildOutputIfcStorageUrl_returnsExpectedPath() {
        UUID projectId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID revisionId = UUID.fromString("22222222-2222-2222-2222-222222222222");

        String path = builder.buildOutputIfcStorageUrl(projectId, revisionId);

        assertThat(path).isEqualTo("s3://batang-artifacts/projects/11111111-1111-1111-1111-111111111111/revisions/22222222-2222-2222-2222-222222222222/ifc/model.v1.ifc");
    }

    @Test
    void buildSceneSnapshotStorageUrl_returnsExpectedPath() {
        UUID projectId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID revisionId = UUID.fromString("22222222-2222-2222-2222-222222222222");

        String path = builder.buildSceneSnapshotStorageUrl(projectId, revisionId, "3d");

        assertThat(path).isEqualTo("s3://batang-artifacts/projects/11111111-1111-1111-1111-111111111111/revisions/22222222-2222-2222-2222-222222222222/3d/snapshot.v1.json");
    }

    @Test
    void buildValidationReportStorageUrl_returnsExpectedPath() {
        UUID projectId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID jobId = UUID.fromString("33333333-3333-3333-3333-333333333333");

        String path = builder.buildValidationReportStorageUrl(projectId, jobId, 2);

        assertThat(path).isEqualTo("s3://batang-artifacts/projects/11111111-1111-1111-1111-111111111111/jobs/33333333-3333-3333-3333-333333333333/steps/002/engine/validation-report.v1.json");
    }

    @Test
    void buildTwoDPlannerOutputStorageUrl_returnsExpectedPath() {
        UUID projectId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID jobId = UUID.fromString("33333333-3333-3333-3333-333333333333");

        String path = builder.buildTwoDPlannerOutputStorageUrl(projectId, jobId, 1);

        assertThat(path).isEqualTo("s3://batang-artifacts/projects/11111111-1111-1111-1111-111111111111/jobs/33333333-3333-3333-3333-333333333333/steps/001/planner/2d-command.v1.json");
    }

    @Test
    void buildThreeDPlannerOutputStorageUrl_returnsExpectedPath() {
        UUID projectId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID jobId = UUID.fromString("33333333-3333-3333-3333-333333333333");

        String path = builder.buildThreeDPlannerOutputStorageUrl(projectId, jobId, 10);

        assertThat(path).isEqualTo("s3://batang-artifacts/projects/11111111-1111-1111-1111-111111111111/jobs/33333333-3333-3333-3333-333333333333/steps/010/planner/3d-command.v1.json");
    }
}
