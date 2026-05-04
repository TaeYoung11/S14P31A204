import type { Client } from '@stomp/stompjs'
import { getStompClient } from '@/shared/lib/stomp'
import type { BubbleData, ConnectionData } from '../types'
import type {
  WorkspaceCommand,
  WorkspaceCommandEntity,
  WorkspaceCommandEnvelope,
  WorkspaceCommandMeta,
  WorkspaceCreateCommand,
  WorkspaceDeleteCommand,
  WorkspaceUpdateCommand,
} from '../types/workspaceCommand.types'

type JsonObject = Record<string, unknown>

const nowTimestamp = (): number => Date.now()

const isObjectRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasAnyKey = (value: JsonObject): boolean => Object.keys(value).length > 0

export const toProjectBubbleUpdateDestination = (projectId: string): string =>
  `/app/project/${projectId}/bubble/update`

export const toProjectCommandDestination = (projectId: string): string =>
  `/app/project/${projectId}/command`

export interface BubbleSnapshotUpdateMessage {
  bubbles: BubbleData[]
  connections: ConnectionData[]
}

export interface CreateCommandOptions {
  timestamp?: number
}

/** 엔티티 생성 command를 만든다. */
export const createEntityCommand = <
  Entity extends WorkspaceCommandEntity,
  Data extends JsonObject,
>(
  entity: Entity,
  id: string,
  data: Data,
  options?: CreateCommandOptions,
): WorkspaceCreateCommand<Entity, Data> => ({
  op: `create.${entity}` as const,
  entity,
  id,
  data,
  timestamp: options?.timestamp ?? nowTimestamp(),
})

export interface UpdateCommandOptions {
  timestamp?: number
}

/** 엔티티 부분 수정 command를 만든다. */
export const updateEntityCommand = <
  Entity extends WorkspaceCommandEntity,
  Patch extends JsonObject,
>(
  entity: Entity,
  id: string,
  patch: Patch,
  options?: UpdateCommandOptions,
): WorkspaceUpdateCommand<Entity, Patch> => {
  if (!hasAnyKey(patch)) {
    throw new Error('update command patch must include at least one changed field.')
  }
  return {
    op: 'update',
    entity,
    id,
    patch,
    timestamp: options?.timestamp ?? nowTimestamp(),
  }
}

export interface DeleteCommandOptions {
  timestamp?: number
}

/** 엔티티 삭제 command를 만든다. */
export const deleteEntityCommand = <Entity extends WorkspaceCommandEntity>(
  entity: Entity,
  id: string,
  options?: DeleteCommandOptions,
): WorkspaceDeleteCommand<Entity> => ({
  op: 'delete',
  entity,
  id,
  timestamp: options?.timestamp ?? nowTimestamp(),
})

export interface CreateWorkspaceCommandEnvelopeOptions {
  schemaVersion?: 'v1'
  meta?: WorkspaceCommandMeta
}

/** command 본문을 실시간 전송 envelope로 감싼다. */
export const createWorkspaceCommandEnvelope = <Command extends WorkspaceCommand>(
  command: Command,
  options?: CreateWorkspaceCommandEnvelopeOptions,
): WorkspaceCommandEnvelope<Command> => ({
  type: 'command',
  schemaVersion: options?.schemaVersion ?? 'v1',
  command,
  meta: options?.meta,
})

export const isWorkspaceCommandEnvelope = (value: unknown): value is WorkspaceCommandEnvelope => {
  if (!isObjectRecord(value)) return false
  if (value.type !== 'command') return false
  if (!isObjectRecord(value.command)) return false

  const command = value.command as JsonObject
  if (typeof command.op !== 'string') return false
  if (typeof command.entity !== 'string') return false
  if (typeof command.id !== 'string' || command.id.length === 0) return false

  if (command.op === 'update') {
    return isObjectRecord(command.patch) && hasAnyKey(command.patch)
  }
  if (command.op === 'delete') {
    return true
  }
  if (command.op.startsWith('create.')) {
    return isObjectRecord(command.data)
  }
  return false
}

interface PublishJsonOptions {
  client?: Client
}

const publishJson = (destination: string, body: unknown, options?: PublishJsonOptions): void => {
  const client = options?.client ?? getStompClient()
  if (!client.connected) {
    throw new Error('STOMP client is not connected.')
  }
  client.publish({
    destination,
    body: JSON.stringify(body),
  })
}

export interface PublishWorkspaceCommandOptions extends PublishJsonOptions {
  destination?: string
}

/** workspace command를 STOMP로 발행한다. */
export const publishWorkspaceCommand = (
  projectId: string,
  envelope: WorkspaceCommandEnvelope,
  options?: PublishWorkspaceCommandOptions,
): void => {
  const destination = options?.destination ?? toProjectCommandDestination(projectId)
  publishJson(destination, envelope, options)
}

export interface PublishBubbleSnapshotOptions extends PublishJsonOptions {
  destination?: string
}

/** 기존 bubble snapshot 동기화 메시지를 STOMP로 발행한다. */
export const publishBubbleSnapshotUpdate = (
  projectId: string,
  message: BubbleSnapshotUpdateMessage,
  options?: PublishBubbleSnapshotOptions,
): void => {
  const destination = options?.destination ?? toProjectBubbleUpdateDestination(projectId)
  publishJson(destination, message, options)
}
