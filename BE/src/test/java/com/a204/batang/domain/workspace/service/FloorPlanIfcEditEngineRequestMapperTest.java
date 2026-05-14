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
