package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.workspace.dto.WorkspaceCommand;
import com.a204.batang.domain.workspace.dto.WorkspaceCommandEnvelope;
import com.a204.batang.domain.workspace.dto.WorkspaceCommandMeta;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class FloorPlanIfcEditEngineRequestMapperTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final FloorPlanIfcEditEngineRequestMapper mapper =
            new FloorPlanIfcEditEngineRequestMapper(objectMapper);

    @Test
    void toEngineRequest_mapsStoreyGlobalIdToStoreyIdForCreateElement() {
        UUID projectId = UUID.randomUUID();
        UUID baseRevisionId = UUID.randomUUID();
        ObjectNode data = objectMapper.createObjectNode()
                .put("ifcClass", "IfcWall")
                .put("storeyGlobalId", "2FStoreyGlobalId00001")
                .put("storeyName", "2F");
        data.putArray("startMm").add(0).add(0);
        data.putArray("endMm").add(3000).add(0);

        JsonNode engineRequest = mapper.toEngineRequest(
                "request-1",
                projectId,
                baseRevisionId,
                List.of(envelope(projectId, baseRevisionId, data))
        );

        JsonNode params = engineRequest.get("operations").get(0).get("parameters");
        assertThat(params.get("storey_id").asText()).isEqualTo("2FStoreyGlobalId00001");
        assertThat(params.get("storey").asText()).isEqualTo("2F");
        assertThat(params.has("storey_global_id")).isFalse();
    }

    @Test
    void toEngineRequest_mapsTranslationMmToTransformElements() {
        UUID projectId = UUID.randomUUID();
        UUID baseRevisionId = UUID.randomUUID();
        ObjectNode patch = objectMapper.createObjectNode();
        patch.putObject("translationMm")
                .put("x", 1000.0)
                .put("y", -2000.0)
                .put("z", 0.0);

        JsonNode engineRequest = mapper.toEngineRequest(
                "request-translation",
                projectId,
                baseRevisionId,
                List.of(envelope(projectId, baseRevisionId, "update", "wall", "2FStoreyGlobalId00001", null, patch))
        );

        JsonNode operation = engineRequest.get("operations").get(0);
        assertThat(operation.get("type").asText()).isEqualTo("transform_elements");
        assertThat(operation.get("selector").get("global_ids").get(0).asText()).isEqualTo("2FStoreyGlobalId00001");
        assertThat(operation.get("parameters").get("translation_mm").get("x").asDouble()).isEqualTo(1000.0);
    }

    @Test
    void toEngineRequest_prioritizesTranslationMmOverPropertyPatch() {
        UUID projectId = UUID.randomUUID();
        UUID baseRevisionId = UUID.randomUUID();
        ObjectNode patch = objectMapper.createObjectNode()
                .put("material", "concrete");
        patch.putObject("translationMm")
                .put("x", 1000.0)
                .put("y", 0.0)
                .put("z", 0.0);

        JsonNode engineRequest = mapper.toEngineRequest(
                "request-translation-priority",
                projectId,
                baseRevisionId,
                List.of(envelope(projectId, baseRevisionId, "update", "wall", "2FStoreyGlobalId00001", null, patch))
        );

        JsonNode operations = engineRequest.get("operations");
        assertThat(operations).hasSize(1);
        JsonNode operation = operations.get(0);
        assertThat(operation.get("type").asText()).isEqualTo("transform_elements");
        assertThat(operation.get("parameters").has("translation_mm")).isTrue();
        assertThat(operation.get("parameters").has("material")).isFalse();
    }

    @Test
    void toEngineRequest_mapsRotationDegreesToTransformElements() {
        UUID projectId = UUID.randomUUID();
        UUID baseRevisionId = UUID.randomUUID();
        ObjectNode patch = objectMapper.createObjectNode();
        patch.putObject("rotation_degrees")
                .put("x", 0.0)
                .put("y", 15.0)
                .put("z", 0.0);

        JsonNode engineRequest = mapper.toEngineRequest(
                "request-rotation",
                projectId,
                baseRevisionId,
                List.of(envelope(projectId, baseRevisionId, "update", "wall", "2FStoreyGlobalId00001", null, patch))
        );

        JsonNode operation = engineRequest.get("operations").get(0);
        assertThat(operation.get("type").asText()).isEqualTo("transform_elements");
        assertThat(operation.get("parameters").has("rotation_degrees")).isFalse();
        assertThat(operation.get("parameters").get("rotation_deg").get("z").asDouble()).isEqualTo(15.0);
    }

    @Test
    void toEngineRequest_mapsRotationAxisAngleToV2TransformElements() {
        UUID projectId = UUID.randomUUID();
        UUID baseRevisionId = UUID.randomUUID();
        ObjectNode patch = objectMapper.createObjectNode();
        ObjectNode rotation = patch.putObject("rotation_axis_angle");
        rotation.putObject("axis")
                .put("x", 0.0)
                .put("y", 0.0)
                .put("z", 1.0);
        rotation.put("angle_degrees", 90.0);
        rotation.put("pivot", "BBOX_CENTER");

        JsonNode engineRequest = mapper.toEngineRequest(
                "request-axis-angle-rotation",
                projectId,
                baseRevisionId,
                List.of(envelope(projectId, baseRevisionId, "update", "ifcElement", "2HlybO1QH4A9HpWyE9qInJ", null, patch))
        );

        assertThat(engineRequest.get("schema_version").asText()).isEqualTo("v2");
        JsonNode rotationDeg = engineRequest.get("operations").get(0).get("parameters").get("rotation_deg");
        assertThat(rotationDeg.get("axis").get("x").asDouble()).isEqualTo(0.0);
        assertThat(rotationDeg.get("axis").get("y").asDouble()).isEqualTo(0.0);
        assertThat(rotationDeg.get("axis").get("z").asDouble()).isEqualTo(1.0);
        assertThat(rotationDeg.get("angle").asDouble()).isEqualTo(90.0);
        assertThat(rotationDeg.get("pivot").asText()).isEqualTo("BBOX_CENTER");
    }

    @Test
    void toEngineRequest_prefersRotationAxisAngleOverLegacyRotationDegrees() {
        UUID projectId = UUID.randomUUID();
        UUID baseRevisionId = UUID.randomUUID();
        ObjectNode patch = objectMapper.createObjectNode();
        patch.putObject("rotation_degrees")
                .put("y", 15.0);
        ObjectNode rotation = patch.putObject("rotationAxisAngle");
        rotation.putObject("axis")
                .put("x", 1.0)
                .put("y", 0.0)
                .put("z", 0.0);
        rotation.put("angle", 30.0);

        JsonNode engineRequest = mapper.toEngineRequest(
                "request-axis-angle-priority",
                projectId,
                baseRevisionId,
                List.of(envelope(projectId, baseRevisionId, "update", "ifcElement", "2HlybO1QH4A9HpWyE9qInJ", null, patch))
        );

        JsonNode rotationDeg = engineRequest.get("operations").get(0).get("parameters").get("rotation_deg");
        assertThat(rotationDeg.has("z")).isFalse();
        assertThat(rotationDeg.get("axis").get("x").asDouble()).isEqualTo(1.0);
        assertThat(rotationDeg.get("angle").asDouble()).isEqualTo(30.0);
    }

    @Test
    void toEngineRequest_mapsZOnlyRotationDegreesToTransformElements() {
        UUID projectId = UUID.randomUUID();
        UUID baseRevisionId = UUID.randomUUID();
        ObjectNode patch = objectMapper.createObjectNode();
        patch.put("globalId", "2HlybO1QH4A9HpWyE9qInJ");
        patch.put("ifcClass", "IfcRoof");
        patch.putObject("rotation_degrees")
                .put("z", 26.84518417599014);

        JsonNode engineRequest = mapper.toEngineRequest(
                "request-z-only-rotation",
                projectId,
                baseRevisionId,
                List.of(envelope(projectId, baseRevisionId, "update", "ifcElement", "2HlybO1QH4A9HpWyE9qInJ", null, patch))
        );

        JsonNode operations = engineRequest.get("operations");
        assertThat(operations).hasSize(1);
        JsonNode operation = operations.get(0);
        assertThat(operation.get("type").asText()).isEqualTo("transform_elements");
        assertThat(operation.get("selector").get("global_ids").get(0).asText()).isEqualTo("2HlybO1QH4A9HpWyE9qInJ");
        assertThat(operation.get("parameters").get("rotation_deg").get("z").asDouble()).isEqualTo(26.84518417599014);
    }

    @Test
    void toEngineRequest_mapsXOnlyThreeDRotationDegreesToIfcZRotation() {
        UUID projectId = UUID.randomUUID();
        UUID baseRevisionId = UUID.randomUUID();
        ObjectNode patch = objectMapper.createObjectNode();
        patch.put("globalId", "0_1GF8Yyj6mv1iBS0kJvFI");
        patch.put("expressId", 555);
        patch.put("ifcClass", "IfcRoof");
        patch.putObject("rotation_degrees")
                .put("x", 72.4850252024334);

        JsonNode engineRequest = mapper.toEngineRequest(
                "request-x-only-rotation",
                projectId,
                baseRevisionId,
                List.of(envelope(projectId, baseRevisionId, "update", "ifcElement", "0_1GF8Yyj6mv1iBS0kJvFI", null, patch))
        );

        JsonNode operations = engineRequest.get("operations");
        assertThat(operations).hasSize(1);
        JsonNode operation = operations.get(0);
        assertThat(operation.get("type").asText()).isEqualTo("transform_elements");
        assertThat(operation.get("selector").get("global_ids").get(0).asText()).isEqualTo("0_1GF8Yyj6mv1iBS0kJvFI");
        assertThat(operation.get("parameters").get("rotation_deg").get("z").asDouble()).isEqualTo(72.4850252024334);
    }

    @Test
    void toEngineRequest_prefersNonZeroZRotationWhenYAxisIsZero() {
        UUID projectId = UUID.randomUUID();
        UUID baseRevisionId = UUID.randomUUID();
        ObjectNode patch = objectMapper.createObjectNode();
        patch.putObject("rotation_degrees")
                .put("x", 0.0)
                .put("y", 0.0)
                .put("z", -82.51572006705355);

        JsonNode engineRequest = mapper.toEngineRequest(
                "request-z-precedence",
                projectId,
                baseRevisionId,
                List.of(envelope(projectId, baseRevisionId, "update", "ifcElement", "3s2uah2CP65OGApQS50SKQ", null, patch))
        );

        JsonNode operation = engineRequest.get("operations").get(0);
        assertThat(operation.get("type").asText()).isEqualTo("transform_elements");
        assertThat(operation.get("parameters").get("rotation_deg").get("z").asDouble()).isEqualTo(-82.51572006705355);
    }

    @Test
    void toEngineRequest_mapsRoomUpdateToIfcSpacePropertiesWhenGlobalIdExists() {
        UUID projectId = UUID.randomUUID();
        UUID baseRevisionId = UUID.randomUUID();
        ObjectNode patch = objectMapper.createObjectNode()
                .put("widthMm", 3200.0)
                .put("heightMm", 4100.0)
                .put("label", "회의실");

        JsonNode engineRequest = mapper.toEngineRequest(
                "request-room",
                projectId,
                baseRevisionId,
                List.of(envelope(projectId, baseRevisionId, "update", "room", "0uZx9kVq18Uem5tVw8JkQ$", null, patch))
        );

        JsonNode operation = engineRequest.get("operations").get(0);
        assertThat(operation.get("type").asText()).isEqualTo("update_element_properties");
        assertThat(operation.get("selector").get("global_ids").get(0).asText()).isEqualTo("0uZx9kVq18Uem5tVw8JkQ$");
        assertThat(operation.get("parameters").get("dimensions_mm").get("width").asDouble()).isEqualTo(3200.0);
        assertThat(operation.get("parameters").get("properties").get("name").asText()).isEqualTo("회의실");
    }

    @Test
    void toEngineRequest_skipsRoomUpdateWhenIdIsNotIfcGlobalId() {
        UUID projectId = UUID.randomUUID();
        UUID baseRevisionId = UUID.randomUUID();
        ObjectNode patch = objectMapper.createObjectNode()
                .put("widthMm", 3200.0);

        JsonNode engineRequest = mapper.toEngineRequest(
                "request-local-room",
                projectId,
                baseRevisionId,
                List.of(envelope(projectId, baseRevisionId, "update", "room", "bubble-1", null, patch))
        );

        assertThat(engineRequest.get("operations")).isEmpty();
    }

    private WorkspaceCommandEnvelope envelope(UUID projectId, UUID baseRevisionId, JsonNode data) {
        return envelope(projectId, baseRevisionId, "create", "wall", "local-wall-1", data, null);
    }

    private WorkspaceCommandEnvelope envelope(
            UUID projectId,
            UUID baseRevisionId,
            String op,
            String entity,
            String id,
            JsonNode data,
            JsonNode patch
    ) {
        return new WorkspaceCommandEnvelope(
                "command",
                "v1",
                UUID.randomUUID(),
                projectId,
                baseRevisionId,
                0,
                new WorkspaceCommand(
                        op,
                        entity,
                        id,
                        data,
                        patch,
                        1L
                ),
                new WorkspaceCommandMeta("2d", "client-1", null, "2026-05-14T00:00:00Z")
        );
    }
}
