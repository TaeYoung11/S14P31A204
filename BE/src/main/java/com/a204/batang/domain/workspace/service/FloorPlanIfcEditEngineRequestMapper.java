package com.a204.batang.domain.workspace.service;

import com.a204.batang.domain.workspace.dto.WorkspaceCommandEnvelope;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class FloorPlanIfcEditEngineRequestMapper {

    private static final String IFC_GLOBAL_ID_PATTERN = "^[0-9A-Za-z_$]{22}$";

    private final ObjectMapper objectMapper;

    public JsonNode toEngineRequest(String requestId, UUID projectId, UUID baseRevisionId, List<WorkspaceCommandEnvelope> batch) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("schema_version", "v2");
        root.put("request_id", requestId);
        root.put("mode", "apply");
        root.put("project_id", projectId.toString());
        root.put("base_revision_id", baseRevisionId.toString());
        ArrayNode operations = root.putArray("operations");

        for (WorkspaceCommandEnvelope envelope : batch) {
            JsonNode operation = toOperation(envelope);
            if (operation != null) {
                operations.add(operation);
            }
        }
        return root;
    }

    private JsonNode toOperation(WorkspaceCommandEnvelope envelope) {
        String op = envelope.command().op();
        return switch (op) {
            case "create" -> toCreateOperation(envelope);
            case "update" -> toUpdateOperation(envelope);
            case "delete" -> toDeleteOperation(envelope);
            default -> null;
        };
    }

    private JsonNode toCreateOperation(WorkspaceCommandEnvelope envelope) {
        JsonNode data = envelope.command().data();
        if (data == null || !data.isObject()) {
            return null;
        }

        ObjectNode params = objectMapper.createObjectNode();
        String entity = envelope.command().entity();
        String elementType = toIfcClass(entity, text(data, "ifcClass"));
        if (elementType == null) {
            return null;
        }
        params.put("element_type", elementType);
        putText(params, "storey_id", firstText(data, "storeyGlobalId", "storey_global_id", "storey_id"));
        putText(params, "storey", firstText(data, "storeyName", "storey"));
        putPoint(params, "start_mm", firstPoint(data, "startMm", "start_mm"));
        putPoint(params, "end_mm", firstPoint(data, "endMm", "end_mm"));
        putPoint(params, "center_mm", firstPoint(data, "centerMm", "center_mm"));
        putText(params, "host_wall_global_id", firstText(data, "hostWallGlobalId", "host_wall_global_id", "wall_id"));
        putDimensions(params, data, false);
        putNumber(params, "sill_height_mm", firstNumber(data, "sill_height", "sillHeightMm"));
        putText(params, "material", text(data, "material"));
        putText(params, "color", text(data, "color"));
        if ("wall".equals(entity)) {
            putText(params, "wall_type", firstText(data, "wall_type", "wallType", "type"));
        }

        return operation(envelope.commandId().toString(), "create_element", null, params);
    }

    private JsonNode toUpdateOperation(WorkspaceCommandEnvelope envelope) {
        JsonNode patch = envelope.command().patch();
        if (patch == null || !patch.isObject() || patch.isEmpty()) {
            return null;
        }

        String entity = envelope.command().entity();
        String globalId = firstText(patch, "globalId", "global_id");
        if (globalId == null || globalId.isBlank()) {
            globalId = envelope.command().id();
        }
        if (globalId == null || globalId.isBlank()) {
            return null;
        }
        if ("room".equals(entity) && !isIfcGlobalId(globalId)) {
            return null;
        }

        JsonNode translationMm = firstPoint3d(patch, "translationMm", "translation_mm", "translateMm", "translate_mm");
        JsonNode rotationAxisAngle = firstRotationAxisAngle(patch, "rotation_axis_angle", "rotationAxisAngle");
        JsonNode rotationDegrees = firstRotation(patch, "rotation_degrees", "rotationDegrees", "rotationDeg");
        if (translationMm != null) {
            // Realtime workspace commands are single-purpose; movement and property edits must be emitted separately.
            ObjectNode params = objectMapper.createObjectNode();
            params.set("translation_mm", translationMm);
            if (rotationAxisAngle != null) {
                params.set("rotation_deg", toIfcRotationAxisAngle(rotationAxisAngle));
            } else if (rotationDegrees != null) {
                params.set("rotation_deg", toIfcRotationDeg(rotationDegrees));
            }
            return operation(envelope.commandId().toString(), "transform_elements", selector(globalId), params);
        }
        if (rotationAxisAngle != null) {
            ObjectNode params = objectMapper.createObjectNode();
            params.set("rotation_deg", toIfcRotationAxisAngle(rotationAxisAngle));
            return operation(envelope.commandId().toString(), "transform_elements", selector(globalId), params);
        }
        if (rotationDegrees != null) {
            ObjectNode params = objectMapper.createObjectNode();
            params.set("rotation_deg", toIfcRotationDeg(rotationDegrees));
            return operation(envelope.commandId().toString(), "transform_elements", selector(globalId), params);
        }

        JsonNode startMm = firstPoint(patch, "startMm", "start_mm");
        JsonNode endMm = firstPoint(patch, "endMm", "end_mm");
        if (startMm != null || endMm != null) {
            ObjectNode params = objectMapper.createObjectNode();
            putPoint(params, "start_mm", startMm);
            putPoint(params, "end_mm", endMm);
            return operation(envelope.commandId().toString(), "transform_elements", selector(globalId), params);
        }

        ObjectNode params = objectMapper.createObjectNode();
        putDimensions(params, patch, !"room".equals(entity));
        putText(params, "material", text(patch, "material"));
        putText(params, "color", text(patch, "color"));
        if ("wall".equals(entity)) {
            putText(params, "wall_type", firstText(patch, "wall_type", "wallType", "type"));
        }
        putRoomProperties(params, patch, entity);
        if (!params.has("dimensions_mm")
                && !params.has("material")
                && !params.has("color")
                && !params.has("wall_type")
                && !params.has("properties")
                && !params.has("pset_updates")
                && !params.has("pset_name")) {
            return null;
        }
        return operation(envelope.commandId().toString(), "update_element_properties", selector(globalId), params);
    }

    private JsonNode toDeleteOperation(WorkspaceCommandEnvelope envelope) {
        String globalId = envelope.command().id();
        if (globalId == null || globalId.isBlank()) {
            return null;
        }
        if (!isIfcGlobalId(globalId)) {
            return null;
        }
        return operation(envelope.commandId().toString(), "delete_elements", selector(globalId), objectMapper.createObjectNode());
    }

    private ObjectNode operation(String id, String type, ObjectNode selector, ObjectNode parameters) {
        ObjectNode operation = objectMapper.createObjectNode();
        operation.put("id", id);
        operation.put("type", type);
        if (selector != null) {
            operation.set("selector", selector);
        }
        operation.set("parameters", parameters);
        return operation;
    }

    private ObjectNode selector(String globalId) {
        ObjectNode selector = objectMapper.createObjectNode();
        ArrayNode ids = selector.putArray("global_ids");
        ids.add(globalId);
        return selector;
    }

    private void putDimensions(ObjectNode params, JsonNode source, boolean wrapMode) {
        ObjectNode dimensions = objectMapper.createObjectNode();
        putDimension(dimensions, "length", firstNumber(source, "lengthMm", "length", "length_mm"), wrapMode);
        putDimension(dimensions, "height", firstNumber(source, "heightMm", "height", "height_mm"), wrapMode);
        putDimension(dimensions, "width", firstNumber(source, "thickness", "thicknessMm", "width", "widthMm", "width_mm"), wrapMode);
        putDimension(dimensions, "sill_height", firstNumber(source, "sill_height", "sillHeightMm"), wrapMode);
        if (!dimensions.isEmpty()) {
            params.set("dimensions_mm", dimensions);
        }
    }

    private void putDimension(ObjectNode dimensions, String key, Double value, boolean wrapMode) {
        if (value == null || !Double.isFinite(value) || value <= 0) {
            return;
        }
        if (!wrapMode) {
            dimensions.put(key, value);
            return;
        }
        ObjectNode wrapped = objectMapper.createObjectNode();
        wrapped.put("mode", "ABSOLUTE");
        wrapped.put("value", value);
        dimensions.set(key, wrapped);
    }

    private void putPoint(ObjectNode target, String field, JsonNode point) {
        if (point != null) {
            target.set(field, point);
        }
    }

    private void putText(ObjectNode target, String field, String value) {
        if (value != null && !value.isBlank()) {
            target.put(field, value);
        }
    }

    private void putNumber(ObjectNode target, String field, Double value) {
        if (value != null && Double.isFinite(value)) {
            target.put(field, value);
        }
    }

    private void putRoomProperties(ObjectNode params, JsonNode patch, String entity) {
        if (!"room".equals(entity)) {
            return;
        }

        ObjectNode properties = objectMapper.createObjectNode();
        putText(properties, "name", firstText(patch, "name", "label"));
        putText(properties, "space_type", firstText(patch, "spaceType", "space_type", "type"));
        JsonNode polygonMm = patch.get("polygonMm");
        if (polygonMm == null || polygonMm.isNull()) {
            polygonMm = patch.get("polygon_mm");
        }
        if (polygonMm != null && polygonMm.isArray() && !polygonMm.isEmpty()) {
            properties.set("polygon_mm", polygonMm);
        }
        if (!properties.isEmpty()) {
            params.set("properties", properties);
        }

        JsonNode psetUpdates = patch.get("pset_updates");
        if (psetUpdates != null && psetUpdates.isObject() && !psetUpdates.isEmpty()) {
            params.set("pset_updates", psetUpdates);
        }
        putText(params, "pset_name", text(patch, "pset_name"));
    }

    private String toIfcClass(String entity, String fallback) {
        if (fallback != null && fallback.startsWith("Ifc")) {
            return fallback;
        }
        return switch (entity) {
            case "wall" -> "IfcWall";
            case "room" -> "IfcSpace";
            case "door" -> "IfcDoor";
            case "window", "opening" -> "IfcWindow";
            case "slab" -> "IfcSlab";
            case "column" -> "IfcColumn";
            case "beam" -> "IfcBeam";
            case "stair" -> "IfcStair";
            case "roof" -> "IfcRoof";
            default -> null;
        };
    }

    private String firstText(JsonNode node, String... keys) {
        for (String key : keys) {
            String value = text(node, key);
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private String text(JsonNode node, String key) {
        JsonNode value = node == null ? null : node.get(key);
        if (value == null || value.isNull()) {
            return null;
        }
        return value.asText();
    }

    private Double firstNumber(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode value = node == null ? null : node.get(key);
            if (value != null && value.isNumber()) {
                return value.asDouble();
            }
        }
        return null;
    }

    private JsonNode firstPoint(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode value = node == null ? null : node.get(key);
            if (value == null || value.isNull()) {
                continue;
            }
            if (value.isArray() && value.size() >= 2 && value.get(0).isNumber() && value.get(1).isNumber()) {
                ObjectNode point = objectMapper.createObjectNode();
                point.put("x", value.get(0).asDouble());
                point.put("y", value.get(1).asDouble());
                return point;
            }
            if (value.isObject() && value.get("x") != null && value.get("y") != null
                    && value.get("x").isNumber() && value.get("y").isNumber()) {
                ObjectNode point = objectMapper.createObjectNode();
                point.put("x", value.get("x").asDouble());
                point.put("y", value.get("y").asDouble());
                return point;
            }
        }
        return null;
    }

    private boolean isIfcGlobalId(String value) {
        return value != null && value.matches(IFC_GLOBAL_ID_PATTERN);
    }

    private JsonNode firstPoint3d(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode value = node == null ? null : node.get(key);
            if (value == null || value.isNull()) {
                continue;
            }
            if (value.isArray() && value.size() >= 2 && value.get(0).isNumber() && value.get(1).isNumber()) {
                ObjectNode point = objectMapper.createObjectNode();
                point.put("x", value.get(0).asDouble());
                point.put("y", value.get(1).asDouble());
                if (value.size() >= 3 && value.get(2).isNumber()) {
                    point.put("z", value.get(2).asDouble());
                }
                return point;
            }
            if (value.isObject() && hasNumber(value, "x") && hasNumber(value, "y")) {
                ObjectNode point = objectMapper.createObjectNode();
                point.put("x", value.get("x").asDouble());
                point.put("y", value.get("y").asDouble());
                if (hasNumber(value, "z")) {
                    point.put("z", value.get("z").asDouble());
                }
                return point;
            }
        }
        return null;
    }

    private JsonNode firstRotation(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode value = node == null ? null : node.get(key);
            if (value == null || value.isNull()) {
                continue;
            }
            if (value.isNumber()) {
                return value;
            }
            if (value.isArray() && value.size() >= 3
                    && value.get(0).isNumber()
                    && value.get(1).isNumber()
                    && value.get(2).isNumber()) {
                ObjectNode rotation = objectMapper.createObjectNode();
                rotation.put("x", value.get(0).asDouble());
                rotation.put("y", value.get(1).asDouble());
                rotation.put("z", value.get(2).asDouble());
                return rotation;
            }
            if (value.isObject()
                    && (hasNumber(value, "x") || hasNumber(value, "y") || hasNumber(value, "z"))) {
                ObjectNode rotation = objectMapper.createObjectNode();
                if (hasNumber(value, "x")) {
                    rotation.put("x", value.get("x").asDouble());
                }
                if (hasNumber(value, "y")) {
                    rotation.put("y", value.get("y").asDouble());
                }
                if (hasNumber(value, "z")) {
                    rotation.put("z", value.get("z").asDouble());
                }
                return rotation;
            }
        }
        return null;
    }

    private JsonNode firstRotationAxisAngle(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode value = node == null ? null : node.get(key);
            if (value == null || value.isNull() || !value.isObject()) {
                continue;
            }
            JsonNode axis = value.get("axis");
            Double angle = firstNumber(value, "angle_degrees", "angleDegrees", "angle");
            if (axis == null || !axis.isObject() || angle == null || !Double.isFinite(angle)) {
                continue;
            }
            Double x = firstNumber(axis, "x");
            Double y = firstNumber(axis, "y");
            Double z = firstNumber(axis, "z");
            if (x == null || y == null || z == null) {
                continue;
            }
            double axisLength = Math.sqrt(x * x + y * y + z * z);
            if (!Double.isFinite(axisLength) || axisLength <= 1.0e-8 || Math.abs(angle) <= 1.0e-6) {
                continue;
            }
            ObjectNode rotation = objectMapper.createObjectNode();
            ObjectNode normalizedAxis = rotation.putObject("axis");
            normalizedAxis.put("x", x / axisLength);
            normalizedAxis.put("y", y / axisLength);
            normalizedAxis.put("z", z / axisLength);
            rotation.put("angle", angle);
            String pivot = firstText(value, "pivot");
            rotation.put("pivot", pivot == null || pivot.isBlank() ? "BBOX_CENTER" : pivot);
            return rotation;
        }
        return null;
    }

    private boolean hasNumber(JsonNode node, String key) {
        return node.get(key) != null && node.get(key).isNumber();
    }

    private ObjectNode toIfcRotationDeg(JsonNode rotationDegrees) {
        ObjectNode rotation = objectMapper.createObjectNode();
        if (rotationDegrees == null || rotationDegrees.isNull()) {
            return rotation;
        }
        if (rotationDegrees.isNumber()) {
            rotation.put("z", rotationDegrees.asDouble());
            return rotation;
        }
        if (rotationDegrees.isObject()) {
            if (hasNonZeroNumber(rotationDegrees, "z")) {
                rotation.put("z", rotationDegrees.get("z").asDouble());
                return rotation;
            }
            if (hasNonZeroNumber(rotationDegrees, "y")) {
                rotation.put("z", rotationDegrees.get("y").asDouble());
                return rotation;
            }
            if (hasNonZeroNumber(rotationDegrees, "x")) {
                rotation.put("z", rotationDegrees.get("x").asDouble());
                return rotation;
            }
            if (hasNumber(rotationDegrees, "z")) {
                rotation.put("z", rotationDegrees.get("z").asDouble());
                return rotation;
            }
            if (hasNumber(rotationDegrees, "y")) {
                rotation.put("z", rotationDegrees.get("y").asDouble());
                return rotation;
            }
            if (hasNumber(rotationDegrees, "x")) {
                rotation.put("z", rotationDegrees.get("x").asDouble());
            }
        }
        return rotation;
    }

    private ObjectNode toIfcRotationAxisAngle(JsonNode rotationAxisAngle) {
        ObjectNode rotation = objectMapper.createObjectNode();
        JsonNode axis = rotationAxisAngle.get("axis");
        ObjectNode axisNode = rotation.putObject("axis");
        axisNode.put("x", axis.get("x").asDouble());
        axisNode.put("y", axis.get("y").asDouble());
        axisNode.put("z", axis.get("z").asDouble());
        rotation.put("angle", rotationAxisAngle.get("angle").asDouble());
        JsonNode pivot = rotationAxisAngle.get("pivot");
        rotation.put("pivot", pivot == null || pivot.isNull() ? "BBOX_CENTER" : pivot.asText("BBOX_CENTER"));
        return rotation;
    }

    private boolean hasNonZeroNumber(JsonNode node, String key) {
        return hasNumber(node, key) && Math.abs(node.get(key).asDouble()) > 1.0e-6;
    }
}
