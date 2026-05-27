export type WorkspaceCommandEntity =
  | 'wall'
  | 'door'
  | 'window'
  | 'opening'
  | 'space'
  | 'room'
  | 'slab'
  | 'column'
  | 'beam'
  | 'stair'
  | 'roof'
  | 'connection'
  | (string & {})

export type WorkspaceCreateOp = 'create'
export type WorkspaceUpdateOp = 'update'
export type WorkspaceDeleteOp = 'delete'
export type WorkspaceCommandOp = WorkspaceCreateOp | WorkspaceUpdateOp | WorkspaceDeleteOp
export type WorkspaceCommandSource = '2d' | '3d'

type WorkspaceRecord = Record<string, unknown>

interface WorkspaceCommandBase<Entity extends WorkspaceCommandEntity = WorkspaceCommandEntity> {
  op: WorkspaceCommandOp
  entity: Entity
  id: string
  timestamp?: number
}

export interface WorkspaceCreateCommand<
  Entity extends WorkspaceCommandEntity = WorkspaceCommandEntity,
  Data extends WorkspaceRecord = WorkspaceRecord,
> extends WorkspaceCommandBase<Entity> {
  op: WorkspaceCreateOp
  data: Data
  patch?: never
}

export interface WorkspaceUpdateCommand<
  Entity extends WorkspaceCommandEntity = WorkspaceCommandEntity,
  Patch extends WorkspaceRecord = WorkspaceRecord,
> extends WorkspaceCommandBase<Entity> {
  op: WorkspaceUpdateOp
  patch: Patch
  data?: never
}

export interface WorkspaceDeleteCommand<
  Entity extends WorkspaceCommandEntity = WorkspaceCommandEntity,
> extends WorkspaceCommandBase<Entity> {
  op: WorkspaceDeleteOp
  data?: never
  patch?: never
}

export type WorkspaceCommand =
  | WorkspaceCreateCommand
  | WorkspaceUpdateCommand
  | WorkspaceDeleteCommand

export interface WorkspaceCommandMeta {
  source: WorkspaceCommandSource
  clientId: string
  userId?: string
  createdAt: string
}

export interface WorkspaceCommandEnvelope<
  Command extends WorkspaceCommand = WorkspaceCommand,
> {
  type: 'command'
  schemaVersion: 'v1'
  commandId: string
  projectId: string
  baseRevisionId: string
  baseIndex: number
  command: Command
  meta: WorkspaceCommandMeta
}
