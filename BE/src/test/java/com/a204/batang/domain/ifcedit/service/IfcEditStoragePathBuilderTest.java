package com.a204.batang.domain.ifcedit.service;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class IfcEditStoragePathBuilderTest {

    private final IfcEditStoragePathBuilder builder = new IfcEditStoragePathBuilder();

    @Test
    void buildSourceIfcStorageUrl_returnsExpectedPath() {
        UUID projectId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID revisionId = UUID.fromString("22222222-2222-2222-2222-222222222222");

        String path = builder.buildSourceIfcStorageUrl(projectId, revisionId);

        assertThat(path).isEqualTo("projects/11111111-1111-1111-1111-111111111111/revisions/22222222-2222-2222-2222-222222222222/model.ifc");
    }

    @Test
    void buildOutputIfcStorageUrl_returnsExpectedPath() {
        UUID projectId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID revisionId = UUID.fromString("22222222-2222-2222-2222-222222222222");

        String path = builder.buildOutputIfcStorageUrl(projectId, revisionId);

        assertThat(path).isEqualTo("projects/11111111-1111-1111-1111-111111111111/revisions/22222222-2222-2222-2222-222222222222/model.ifc");
    }

    @Test
    void buildSceneSnapshotStorageUrl_returnsExpectedPath() {
        UUID projectId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID revisionId = UUID.fromString("22222222-2222-2222-2222-222222222222");

        String path = builder.buildSceneSnapshotStorageUrl(projectId, revisionId);

        assertThat(path).isEqualTo("projects/11111111-1111-1111-1111-111111111111/revisions/22222222-2222-2222-2222-222222222222/scene-ifc.json");
    }

    @Test
    void buildValidationReportStorageUrl_returnsExpectedPath() {
        UUID jobId = UUID.fromString("33333333-3333-3333-3333-333333333333");

        String path = builder.buildValidationReportStorageUrl(jobId, 2);

        assertThat(path).isEqualTo("jobs/33333333-3333-3333-3333-333333333333/steps/2/validation-report.json");
    }

    @Test
    void buildEditPlanStorageUrl_returnsExpectedPath() {
        UUID jobId = UUID.fromString("33333333-3333-3333-3333-333333333333");

        String path = builder.buildEditPlanStorageUrl(jobId);

        assertThat(path).isEqualTo("jobs/33333333-3333-3333-3333-333333333333/steps/1/edit-plan.json");
    }
}
