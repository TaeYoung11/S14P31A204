package com.a204.batang.domain.workspace.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/**
 * 프로젝트별 버블/도면 스냅샷 히스토리를 Redis에 저장/조회한다.
 */
@Repository
@RequiredArgsConstructor
public class WorkspaceBubbleSnapshotRedisRepository {

    private static final String BUBBLE_SNAPSHOT_HISTORY_KEY_TEMPLATE = "workspace:project:%s:bubble:snapshots";
    private static final String FLOOR_PLAN_SNAPSHOT_HISTORY_KEY_TEMPLATE = "workspace:project:%s:floor-plan:snapshots";
    private static final int MAX_SNAPSHOT_HISTORY_SIZE = 10;
    private static final String ERROR_INVALID_INDEX_TOKEN = "__ERROR_INDEX__";

    private static final RedisScript<Long> SAVE_HISTORY_SCRIPT = RedisScript.of("""
            local historyKey = KEYS[1]
            local snapshotPayload = ARGV[1]
            local maxHistorySize = tonumber(ARGV[2])
            local baseIndex = tonumber(ARGV[3])

            if baseIndex == nil then
                return -1
            end

            local currentSize = redis.call('LLEN', historyKey)
            if currentSize == 0 then
                if baseIndex ~= -1 then
                    return -1
                end
            else
                if baseIndex < -1 or baseIndex >= currentSize then
                    return -1
                end

                if baseIndex == -1 then
                    redis.call('DEL', historyKey)
                else
                    redis.call('LTRIM', historyKey, 0, baseIndex)
                end
            end

            redis.call('RPUSH', historyKey, snapshotPayload)
            redis.call('LTRIM', historyKey, -maxHistorySize, -1)
            return 1
            """, Long.class);

    private static final RedisScript<List> SAVE_HISTORY_AND_RETURN_GARBAGE_SCRIPT = RedisScript.of("""
            local historyKey = KEYS[1]
            local snapshotPayload = ARGV[1]
            local maxHistorySize = tonumber(ARGV[2])
            local baseIndex = tonumber(ARGV[3])
            local garbage = {}

            if baseIndex == nil then
                return { '__ERROR_INDEX__' }
            end

            local currentSize = redis.call('LLEN', historyKey)
            if currentSize == 0 then
                if baseIndex ~= -1 then
                    return { '__ERROR_INDEX__' }
                end
            else
                if baseIndex < -1 or baseIndex >= currentSize then
                    return { '__ERROR_INDEX__' }
                end

                if baseIndex == -1 then
                    local allItems = redis.call('LRANGE', historyKey, 0, -1)
                    for i = 1, #allItems do
                        table.insert(garbage, allItems[i])
                    end
                    redis.call('DEL', historyKey)
                else
                    if baseIndex < currentSize - 1 then
                        local futureItems = redis.call('LRANGE', historyKey, baseIndex + 1, -1)
                        for i = 1, #futureItems do
                            table.insert(garbage, futureItems[i])
                        end
                    end
                    redis.call('LTRIM', historyKey, 0, baseIndex)
                end
            end

            redis.call('RPUSH', historyKey, snapshotPayload)

            local finalSize = redis.call('LLEN', historyKey)
            if finalSize > maxHistorySize then
                local overflowCount = finalSize - maxHistorySize
                local oldItems = redis.call('LRANGE', historyKey, 0, overflowCount - 1)
                for i = 1, #oldItems do
                    table.insert(garbage, oldItems[i])
                end
                redis.call('LTRIM', historyKey, -maxHistorySize, -1)
            end

            return garbage
            """, List.class);

    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;

    /**
     * 버블 스냅샷을 Redis 히스토리에 저장한다.
     *
     * @param projectId 프로젝트 ID
     * @param snapshot 스냅샷 JSON
     * @param baseIndex Undo/Redo 기준 인덱스
     * @throws JsonProcessingException JSON 직렬화 실패 시
     */
    public void saveSnapshot(UUID projectId, JsonNode snapshot, int baseIndex) throws JsonProcessingException {
        String key = BUBBLE_SNAPSHOT_HISTORY_KEY_TEMPLATE.formatted(projectId);
        saveSnapshotByKey(key, snapshot, baseIndex);
    }

    /**
     * floor-plan 스냅샷을 Redis 히스토리에 저장한다.
     *
     * @param projectId 프로젝트 ID
     * @param snapshot 스냅샷 JSON
     * @param baseIndex Undo/Redo 기준 인덱스
     * @throws JsonProcessingException JSON 직렬화 실패 시
     */
    public void saveFloorPlanSnapshot(UUID projectId, JsonNode snapshot, int baseIndex) throws JsonProcessingException {
        saveFloorPlanSnapshotAndReturnGarbage(projectId, snapshot, baseIndex);
    }

    /**
     * floor-plan 스냅샷을 저장하고, 저장 과정에서 히스토리에서 제거된 payload를 반환한다.
     *
     * @param projectId 프로젝트 ID
     * @param snapshot 스냅샷 JSON
     * @param baseIndex Undo/Redo 기준 인덱스
     * @return 히스토리에서 제거된 스냅샷 payload(JSON 문자열) 목록
     * @throws JsonProcessingException JSON 직렬화 실패 시
     */
    public List<String> saveFloorPlanSnapshotAndReturnGarbage(
            UUID projectId,
            JsonNode snapshot,
            int baseIndex
    ) throws JsonProcessingException {
        String key = FLOOR_PLAN_SNAPSHOT_HISTORY_KEY_TEMPLATE.formatted(projectId);
        String serializedSnapshot = objectMapper.writeValueAsString(snapshot);

        List<?> result = redisTemplate.execute(
                SAVE_HISTORY_AND_RETURN_GARBAGE_SCRIPT,
                List.of(key),
                serializedSnapshot,
                String.valueOf(MAX_SNAPSHOT_HISTORY_SIZE),
                String.valueOf(baseIndex)
        );

        if (result == null) {
            throw new IllegalStateException("Redis 히스토리 저장 결과를 받을 수 없습니다.");
        }
        if (!result.isEmpty() && ERROR_INVALID_INDEX_TOKEN.equals(result.get(0))) {
            throw new IllegalArgumentException("Undo/Redo 기준 인덱스가 현재 히스토리와 일치하지 않습니다.");
        }

        return result.stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .toList();
    }

    /**
     * 버블 스냅샷 히스토리 크기를 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @return 현재 히스토리 크기
     */
    public int getBubbleSnapshotHistorySize(UUID projectId) {
        String key = BUBBLE_SNAPSHOT_HISTORY_KEY_TEMPLATE.formatted(projectId);
        return getSnapshotHistorySizeByKey(key);
    }

    /**
     * 버블 스냅샷 히스토리에서 인덱스 위치의 스냅샷을 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param index 조회할 인덱스
     * @return 스냅샷 JSON, 없으면 {@code null}
     * @throws JsonProcessingException JSON 역직렬화 실패 시
     */
    public JsonNode findBubbleSnapshotByIndex(UUID projectId, int index) throws JsonProcessingException {
        String key = BUBBLE_SNAPSHOT_HISTORY_KEY_TEMPLATE.formatted(projectId);
        return findSnapshotByIndex(key, index);
    }

    /**
     * floor-plan 스냅샷 히스토리 크기를 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @return 현재 히스토리 크기
     */
    public int getFloorPlanSnapshotHistorySize(UUID projectId) {
        String key = FLOOR_PLAN_SNAPSHOT_HISTORY_KEY_TEMPLATE.formatted(projectId);
        return getSnapshotHistorySizeByKey(key);
    }

    /**
     * floor-plan 스냅샷 히스토리에서 인덱스 위치의 스냅샷을 조회한다.
     *
     * @param projectId 프로젝트 ID
     * @param index 조회할 인덱스
     * @return 스냅샷 JSON, 없으면 {@code null}
     * @throws JsonProcessingException JSON 역직렬화 실패 시
     */
    public JsonNode findFloorPlanSnapshotByIndex(UUID projectId, int index) throws JsonProcessingException {
        String key = FLOOR_PLAN_SNAPSHOT_HISTORY_KEY_TEMPLATE.formatted(projectId);
        return findSnapshotByIndex(key, index);
    }

    private void saveSnapshotByKey(String key, JsonNode snapshot, int baseIndex) throws JsonProcessingException {
        String serializedSnapshot = objectMapper.writeValueAsString(snapshot);

        Long result = redisTemplate.execute(
                SAVE_HISTORY_SCRIPT,
                List.of(key),
                serializedSnapshot,
                String.valueOf(MAX_SNAPSHOT_HISTORY_SIZE),
                String.valueOf(baseIndex)
        );

        if (result == null) {
            throw new IllegalStateException("Redis 히스토리 저장 결과를 받을 수 없습니다.");
        }
        if (result == -1L) {
            throw new IllegalArgumentException("Undo/Redo 기준 인덱스가 현재 히스토리와 일치하지 않습니다.");
        }
    }

    private int getSnapshotHistorySizeByKey(String key) {
        Long size = redisTemplate.opsForList().size(key);
        if (size == null) {
            return 0;
        }
        return size.intValue();
    }

    private JsonNode findSnapshotByIndex(String key, int index) throws JsonProcessingException {
        String snapshotPayload = redisTemplate.opsForList().index(key, index);
        if (snapshotPayload == null) {
            return null;
        }
        return objectMapper.readTree(snapshotPayload);
    }
}