package com.a204.batang.domain.floorplan.service;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class FloorPlanStoragePathBuilderTest {

    private final FloorPlanStoragePathBuilder builder = new FloorPlanStoragePathBuilder();

    @Test
    void buildIfcStorageUrl_returnsExpectedPath() {
        UUID projectId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID revisionId = UUID.fromString("22222222-2222-2222-2222-222222222222");

        String path = builder.buildIfcStorageUrl(projectId, revisionId);

        assertThat(path).isEqualTo("projects/11111111-1111-1111-1111-111111111111/revisions/22222222-2222-2222-2222-222222222222/model.ifc");
    }

    @Test
    void buildValidationReportStorageUrl_returnsExpectedPath() {
        UUID jobId = UUID.fromString("33333333-3333-3333-3333-333333333333");

        String path = builder.buildValidationReportStorageUrl(jobId, 1);

        assertThat(path).isEqualTo("jobs/33333333-3333-3333-3333-333333333333/steps/1/validation-report.json");
    }
}
