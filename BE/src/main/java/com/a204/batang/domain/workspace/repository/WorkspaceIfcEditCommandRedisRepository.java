package com.a204.batang.domain.workspace.repository;

import com.a204.batang.domain.workspace.dto.WorkspaceCommand;
import com.a204.batang.domain.workspace.dto.WorkspaceCommandEnvelope;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Repository;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class WorkspaceIfcEditCommandRedisRepository {

    private static final String BATCH_KEY_TEMPLATE = "workspace:project:%s:ifc-edit:commands:%s:%s";
    private static final String IDEMPOTENCY_KEY_TEMPLATE = "workspace:project:%s:ifc-edit:idempotency:%s";
    private static final String PENDING_BATCHES_KEY = "workspace:ifc-edit:pending-batches";
    private static final String LAST_UPDATED_SUFFIX = ":last-updated";
    private static final Duration COMMAND_TTL = Duration.ofMinutes(5);

    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;

    public BufferResult buffer(UUID projectId, UUID userId, WorkspaceCommandEnvelope envelope)
            throws JsonProcessingException {
        String idempotencyKey = idempotencyKey(projectId, envelope.commandId());
        Boolean firstSeen = redisTemplate.opsForValue()
                .setIfAbsent(idempotencyKey, "1", COMMAND_TTL);
        if (!Boolean.TRUE.equals(firstSeen)) {
            return BufferResult.duplicateResult();
        }

        String batchKey = batchKey(projectId, envelope.baseRevisionId(), userId);
        String mergeKey = mergeKey(envelope);
        WorkspaceCommandEnvelope bufferedEnvelope = mergeWithExistingUpdate(batchKey, mergeKey, envelope);
        redisTemplate.opsForHash().put(batchKey, mergeKey, objectMapper.writeValueAsString(bufferedEnvelope));
        redisTemplate.expire(batchKey, COMMAND_TTL);
        redisTemplate.opsForValue().set(batchKey + LAST_UPDATED_SUFFIX, String.valueOf(System.currentTimeMillis()), COMMAND_TTL);
        redisTemplate.opsForSet().add(PENDING_BATCHES_KEY, batchKey);
        redisTemplate.expire(PENDING_BATCHES_KEY, COMMAND_TTL);
        return BufferResult.accepted(batchKey);
    }

    public List<String> findPendingBatchKeys() {
        Set<String> keys = redisTemplate.opsForSet().members(PENDING_BATCHES_KEY);
        if (keys == null || keys.isEmpty()) {
            return List.of();
        }
        return new ArrayList<>(keys);
    }

    public long lastUpdatedAt(String batchKey) {
        String value = redisTemplate.opsForValue().get(batchKey + LAST_UPDATED_SUFFIX);
        if (value == null) {
            return 0L;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            return 0L;
        }
    }

    public List<WorkspaceCommandEnvelope> findBatch(String batchKey) throws JsonProcessingException {
        List<WorkspaceCommandEnvelope> batch = new ArrayList<>();
        redisTemplate.opsForHash().values(batchKey).forEach(value -> {
            if (value instanceof String serialized) {
                try {
                    batch.add(objectMapper.readValue(serialized, WorkspaceCommandEnvelope.class));
                } catch (JsonProcessingException exception) {
                    throw new CommandBufferSerializationException(exception);
                }
            }
        });
        batch.sort(Comparator.comparing(envelope -> envelope.command().timestamp()));
        return batch;
    }

    public void clearBatch(String batchKey) {
        redisTemplate.delete(batchKey);
        redisTemplate.delete(batchKey + LAST_UPDATED_SUFFIX);
        redisTemplate.opsForSet().remove(PENDING_BATCHES_KEY, batchKey);
    }

    private String batchKey(UUID projectId, UUID baseRevisionId, UUID userId) {
        return BATCH_KEY_TEMPLATE.formatted(projectId, baseRevisionId, userId);
    }

    private String idempotencyKey(UUID projectId, UUID commandId) {
        return IDEMPOTENCY_KEY_TEMPLATE.formatted(projectId, commandId);
    }

    private String mergeKey(WorkspaceCommandEnvelope envelope) {
        String op = envelope.command().op();
        if ("update".equals(op)) {
            return "update:%s:%s".formatted(envelope.command().entity(), envelope.command().id());
        }
        return "%s:%s:%s".formatted(op, envelope.command().entity(), envelope.commandId());
    }

    private WorkspaceCommandEnvelope mergeWithExistingUpdate(
            String batchKey,
            String mergeKey,
            WorkspaceCommandEnvelope envelope
    ) throws JsonProcessingException {
        if (!"update".equals(envelope.command().op())) {
            return envelope;
        }

        Object existing = redisTemplate.opsForHash().get(batchKey, mergeKey);
        if (!(existing instanceof String serialized)) {
            return envelope;
        }

        WorkspaceCommandEnvelope previous = objectMapper.readValue(serialized, WorkspaceCommandEnvelope.class);
        ObjectNode mergedPatch = objectMapper.createObjectNode();
        if (previous.command().patch() != null && previous.command().patch().isObject()) {
            mergedPatch.setAll((ObjectNode) previous.command().patch());
        }
        if (envelope.command().patch() != null && envelope.command().patch().isObject()) {
            mergedPatch.setAll((ObjectNode) envelope.command().patch());
        }

        WorkspaceCommand mergedCommand = new WorkspaceCommand(
                envelope.command().op(),
                envelope.command().entity(),
                envelope.command().id(),
                envelope.command().data(),
                mergedPatch,
                envelope.command().timestamp()
        );
        return new WorkspaceCommandEnvelope(
                envelope.type(),
                envelope.schemaVersion(),
                envelope.commandId(),
                envelope.projectId(),
                envelope.baseRevisionId(),
                envelope.baseIndex(),
                mergedCommand,
                envelope.meta()
        );
    }

    public record BufferResult(boolean accepted, boolean duplicate, String batchKey) {
        public static BufferResult accepted(String batchKey) {
            return new BufferResult(true, false, batchKey);
        }

        public static BufferResult duplicateResult() {
            return new BufferResult(false, true, null);
        }
    }

    private static class CommandBufferSerializationException extends RuntimeException {
        CommandBufferSerializationException(Throwable cause) {
            super(cause);
        }
    }
}
