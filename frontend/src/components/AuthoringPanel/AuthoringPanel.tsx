import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Columns3,
  DoorOpen,
  Grip,
  House,
  MousePointer2,
  Move3D,
  PanelsTopLeft,
  RectangleHorizontal,
  RotateCw,
  Square,
  Trash2,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useStore } from '../../stores/useStore'
import type { AuthoringTool } from '../../types/bim'

type DimensionState = {
  length?: number
  width?: number
  depth?: number
  height?: number
  thickness?: number
  rotation?: number
  elevation?: number
  sillHeight?: number
  pitch?: number
}

const TOOL_OPTIONS: Array<{
  id: AuthoringTool
  label: string
  icon: typeof MousePointer2
  supported: boolean
}> = [
  { id: 'select', label: 'Select', icon: MousePointer2, supported: true },
  { id: 'wall', label: 'Wall', icon: Grip, supported: true },
  { id: 'slab', label: 'Slab', icon: Square, supported: true },
  { id: 'column', label: 'Column', icon: Columns3, supported: true },
  { id: 'beam', label: 'Beam', icon: RectangleHorizontal, supported: true },
  { id: 'door', label: 'Door', icon: DoorOpen, supported: true },
  { id: 'window', label: 'Window', icon: PanelsTopLeft, supported: true },
  { id: 'stair', label: 'Stair', icon: PanelsTopLeft, supported: true },
  { id: 'roof', label: 'Roof', icon: House, supported: true },
  { id: 'move', label: 'Move', icon: Move3D, supported: true },
  { id: 'rotate', label: 'Rotate', icon: RotateCw, supported: true },
  { id: 'delete', label: 'Delete', icon: Trash2, supported: true },
]

const DEFAULTS: Record<string, DimensionState> = {
  wall: { length: 4000, thickness: 200, height: 3000, rotation: 0 },
  slab: { length: 6000, width: 4000, thickness: 250, rotation: 0 },
  column: { width: 400, depth: 400, height: 3000, rotation: 0 },
  beam: { width: 300, depth: 4000, height: 600, rotation: 0, elevation: 2500 },
  door: { width: 900, height: 2100, sillHeight: 0 },
  window: { width: 1500, height: 1200, sillHeight: 900 },
  stair: { width: 1200, depth: 4200, height: 3000 },
  roof: { length: 6000, width: 4000, height: 900, thickness: 250, pitch: 30 },
  move: { rotation: 0 },
  rotate: { rotation: 0 },
}

const DEFAULT_TEMPLATES: Partial<Record<AuthoringTool, string>> = {
  stair: 'straight',
  roof: 'gable',
}

const readIfcScalar = (value: unknown): string | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }
  if (
    value &&
    typeof value === 'object' &&
    'value' in (value as Record<string, unknown>)
  ) {
    const nested = (value as Record<string, unknown>).value
    if (typeof nested === 'string' || typeof nested === 'number') {
      return String(nested)
    }
  }
  return null
}

export const AuthoringPanel = () => {
  const currentProject = useStore((state) => state.currentProject)
  const authoringSession = useStore((state) => state.authoringSession)
  const modelRevision = useStore((state) => state.modelRevision)
  const activeTool = useStore((state) => state.activeTool)
  const setActiveTool = useStore((state) => state.setActiveTool)
  const activeStoreyGuid = useStore((state) => state.activeStoreyGuid)
  const setActiveStoreyGuid = useStore((state) => state.setActiveStoreyGuid)
  const authoringDraft = useStore((state) => state.authoringDraft)
  const resetAuthoringDraft = useStore((state) => state.resetAuthoringDraft)
  const previews = useStore((state) => state.previews)
  const presence = useStore((state) => state.presence)
  const locks = useStore((state) => state.locks)
  const selectedElementId = useStore((state) => state.selectedElementId)
  const selectedElementProperties = useStore((state) => state.selectedElementProperties)
  const setModelRevision = useStore((state) => state.setModelRevision)

  const [material, setMaterial] = useState('concrete')
  const [typeName, setTypeName] = useState('')
  const [dims, setDims] = useState<DimensionState>(DEFAULTS.wall)
  const [template, setTemplate] = useState('straight')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const storeys = currentProject?.meta_info?.storeys ?? []
  const sessionPreview = useMemo(() => {
    if (!authoringSession) return null
    return previews.find((preview) => preview.session_id === authoringSession.session_id) ?? null
  }, [authoringSession, previews])

  useEffect(() => {
    if (storeys.length > 0 && !activeStoreyGuid) {
      setActiveStoreyGuid(storeys[0].guid)
    }
  }, [activeStoreyGuid, setActiveStoreyGuid, storeys])

  useEffect(() => {
    if (activeTool in DEFAULTS) {
      setDims(DEFAULTS[activeTool])
    }
    setTemplate(DEFAULT_TEMPLATES[activeTool] ?? 'straight')
    setStatus(null)
    resetAuthoringDraft()
  }, [activeTool, resetAuthoringDraft])

  const isSupported = TOOL_OPTIONS.find((tool) => tool.id === activeTool)?.supported ?? false
  const isCreateTool = ['wall', 'slab', 'column', 'beam', 'door', 'window', 'stair', 'roof'].includes(activeTool)
  const selectedElementType = useMemo(() => {
    const rawType =
      readIfcScalar(selectedElementProperties?.['type']) ??
      readIfcScalar(selectedElementProperties?.['__category']) ??
      readIfcScalar(selectedElementProperties?.['category'])
    if (!rawType) return null
    const normalized = rawType.toLowerCase().replace(/^ifc/, '')
    if (normalized.startsWith('wall')) return 'wall'
    if (normalized.startsWith('slab')) return 'slab'
    if (normalized.startsWith('column')) return 'column'
    if (normalized.startsWith('beam')) return 'beam'
    if (normalized.startsWith('door')) return 'door'
    if (normalized.startsWith('window')) return 'window'
    if (normalized.startsWith('stair')) return 'stair'
    if (normalized.startsWith('roof')) return 'roof'
    return null
  }, [selectedElementProperties])
  const selectedWallHostGuid = selectedElementType === 'wall' ? selectedElementId : null

  const buildGeometry = () => {
    if (activeTool === 'wall') {
      return {
        start: authoringDraft.start,
        end: authoringDraft.end,
        dimensions: {
          length: dims.length,
          thickness: dims.thickness,
          height: dims.height,
        },
      }
    }

    if (activeTool === 'slab') {
      return {
        position: authoringDraft.position,
        rotation: { x: 0, y: 0, z: dims.rotation ?? 0 },
        dimensions: {
          length: dims.length,
          width: dims.width,
          thickness: dims.thickness,
        },
      }
    }

    if (activeTool === 'column') {
      return {
        position: authoringDraft.position,
        rotation: { x: 0, y: 0, z: dims.rotation ?? 0 },
        dimensions: {
          width: dims.width,
          depth: dims.depth,
          height: dims.height,
        },
      }
    }

    if (activeTool === 'beam') {
      return {
        position: authoringDraft.position
          ? { ...authoringDraft.position, z: authoringDraft.position.z + (dims.elevation ?? 0) }
          : undefined,
        rotation: { x: 0, y: 0, z: dims.rotation ?? 0 },
        dimensions: {
          width: dims.width,
          depth: dims.depth,
          height: dims.height,
        },
      }
    }

    if (activeTool === 'door' || activeTool === 'window') {
      return {
        position: authoringDraft.position,
        dimensions: {
          width: dims.width,
          height: dims.height,
          sill_height: dims.sillHeight,
        },
      }
    }

    if (activeTool === 'stair') {
      return {
        position: authoringDraft.position,
        template,
        dimensions: {
          width: dims.width,
          depth: dims.depth,
          height: dims.height,
        },
      }
    }

    if (activeTool === 'roof') {
      return {
        position: authoringDraft.position,
        template,
        dimensions: {
          length: dims.length,
          width: dims.width,
          height: dims.height,
          thickness: dims.thickness,
          pitch: dims.pitch,
        },
      }
    }

    if (activeTool === 'move') {
      return {
        position: authoringDraft.position,
      }
    }

    if (activeTool === 'rotate') {
      return {
        rotation: { x: 0, y: 0, z: dims.rotation ?? 0 },
      }
    }

    return {}
  }

  const validateDraft = () => {
    if (!authoringSession?.session_id) return 'Authoring session is not ready.'
    if (!currentProject?.id) return 'Project is not ready.'
    if (!isSupported) return 'This tool is not implemented yet.'

    if (activeTool === 'wall' && (!authoringDraft.start || !authoringDraft.end)) {
      return 'Pick the wall start and end points in the viewer.'
    }
    if (['slab', 'column', 'beam', 'door', 'window', 'stair', 'roof'].includes(activeTool) && !authoringDraft.position) {
      return `Click in the viewer to place the ${activeTool}.`
    }
    if (activeTool === 'delete' && !selectedElementId) {
      return 'Select an element to delete.'
    }
    if ((activeTool === 'door' || activeTool === 'window') && !selectedWallHostGuid) {
      return 'Select a wall first to host the door or window.'
    }
    if ((activeTool === 'move' || activeTool === 'rotate') && !selectedElementId) {
      return `Select an element to ${activeTool}.`
    }
    if (['delete', 'move', 'rotate'].includes(activeTool) && !selectedElementType) {
      return `Selected element type is not supported for ${activeTool}.`
    }
    if (activeTool === 'move' && !authoringDraft.position) {
      return 'Click in the viewer to place the selected element at its new base point.'
    }

    return null
  }

  const submitOperation = async (mode: 'preview' | 'apply' | 'cancel') => {
    const validationMessage = mode === 'cancel' ? null : validateDraft()
    if (validationMessage) {
      setStatus(validationMessage)
      return
    }
    if (!authoringSession?.session_id || !currentProject?.id) return

    const action =
      mode === 'cancel'
        ? sessionPreview?.action ?? 'create'
        : activeTool === 'delete'
          ? 'delete'
          : activeTool === 'move' || activeTool === 'rotate'
            ? 'update'
            : 'create'
    const elementType =
      mode === 'cancel'
        ? sessionPreview?.element_type ?? 'wall'
        : activeTool === 'delete' || activeTool === 'move' || activeTool === 'rotate'
          ? selectedElementType ?? 'wall'
          : activeTool

    const payload = {
      session_id: authoringSession.session_id,
      operation: {
        operation_id: `op_${Date.now()}`,
        base_revision: modelRevision,
        mode,
        action,
        element_type: elementType,
        target: {
          storey_guid: activeStoreyGuid ?? sessionPreview?.storey_guid,
          element_guid: ['delete', 'move', 'rotate'].includes(activeTool) ? selectedElementId : undefined,
          host_guid: activeTool === 'door' || activeTool === 'window' ? selectedWallHostGuid : undefined,
        },
        geometry: mode === 'cancel' ? {} : buildGeometry(),
        semantics: {
          material: isCreateTool ? material : 'concrete',
          type_name: isCreateTool ? typeName || undefined : undefined,
          psets: {},
        },
      },
    }

    setIsSubmitting(true)
    setStatus(mode === 'preview' ? 'Generating preview...' : mode === 'apply' ? 'Applying commit...' : 'Cancelling preview...')

    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/projects/${currentProject.id}/authoring/commit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || 'Authoring request failed')
      }

      setModelRevision(data.model_revision ?? modelRevision)
      if (mode !== 'preview') {
        resetAuthoringDraft()
      }
      setStatus(data.message ?? 'Done')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Authoring request failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full h-full flex flex-col glass-panel rounded-3xl overflow-hidden shadow-2xl">
      <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div>
          <h2 className="text-sm font-bold tracking-tight">Authoring Workspace</h2>
          <p className="text-[10px] text-white/30 uppercase tracking-widest">
            Phase 3 IFC4 authoring
          </p>
        </div>
        <div className="text-[10px] text-white/40 uppercase tracking-widest">
          REV {modelRevision}
        </div>
      </div>

      <div className="p-4 border-b border-white/5 bg-white/[0.01]">
        <div className="grid grid-cols-4 gap-2">
          {TOOL_OPTIONS.map(({ id, label, icon: Icon, supported }) => (
            <button
              key={id}
              onClick={() => setActiveTool(id)}
              className={clsx(
                'rounded-2xl border px-3 py-3 text-left transition-all',
                activeTool === id
                  ? 'border-primary bg-primary/10 text-white'
                  : 'border-white/5 bg-white/[0.02] text-white/60 hover:text-white',
                !supported && 'opacity-40',
              )}
            >
              <Icon className="w-4 h-4 mb-2" />
              <div className="text-[11px] font-bold uppercase tracking-wider">{label}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
        <section className="space-y-3">
          <Label>Storey</Label>
          <select
            value={activeStoreyGuid ?? ''}
            onChange={(event) => setActiveStoreyGuid(event.target.value)}
            className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-sm"
          >
            {storeys.map((storey, index) => (
              <option
                key={`${storey.guid || storey.name || 'storey'}-${storey.id ?? index}-${index}`}
                value={storey.guid}
              >
                {storey.name}
              </option>
            ))}
          </select>
        </section>

        {isCreateTool && (
          <section className="space-y-3">
            <Label>Type Name</Label>
            <input
              value={typeName}
              onChange={(event) => setTypeName(event.target.value)}
              placeholder="Optional type label"
              className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-sm"
            />
          </section>
        )}

        {isCreateTool && (
          <section className="space-y-3">
            <Label>Material</Label>
            <select
              value={material}
              onChange={(event) => setMaterial(event.target.value)}
              className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-sm"
            >
              {['concrete', 'brick', 'steel', 'wood', 'glass', 'orange', 'gray'].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </section>
        )}

        {activeTool === 'wall' && (
          <>
            <DimensionInput label="Thickness" value={dims.thickness} onChange={(value) => setDims({ ...dims, thickness: value })} />
            <DimensionInput label="Height" value={dims.height} onChange={(value) => setDims({ ...dims, height: value })} />
          </>
        )}

        {activeTool === 'slab' && (
          <>
            <DimensionInput label="Length" value={dims.length} onChange={(value) => setDims({ ...dims, length: value })} />
            <DimensionInput label="Width" value={dims.width} onChange={(value) => setDims({ ...dims, width: value })} />
            <DimensionInput label="Thickness" value={dims.thickness} onChange={(value) => setDims({ ...dims, thickness: value })} />
          </>
        )}

        {activeTool === 'column' && (
          <>
            <DimensionInput label="Width" value={dims.width} onChange={(value) => setDims({ ...dims, width: value })} />
            <DimensionInput label="Depth" value={dims.depth} onChange={(value) => setDims({ ...dims, depth: value })} />
            <DimensionInput label="Height" value={dims.height} onChange={(value) => setDims({ ...dims, height: value })} />
          </>
        )}

        {activeTool === 'beam' && (
          <>
            <DimensionInput label="Width" value={dims.width} onChange={(value) => setDims({ ...dims, width: value })} />
            <DimensionInput label="Depth" value={dims.depth} onChange={(value) => setDims({ ...dims, depth: value })} />
            <DimensionInput label="Height" value={dims.height} onChange={(value) => setDims({ ...dims, height: value })} />
            <DimensionInput label="Elevation" value={dims.elevation ?? 2500} onChange={(value) => setDims({ ...dims, elevation: value })} />
          </>
        )}

        {activeTool === 'door' && (
          <>
            <DimensionInput label="Width" value={dims.width} onChange={(value) => setDims({ ...dims, width: value })} />
            <DimensionInput label="Height" value={dims.height} onChange={(value) => setDims({ ...dims, height: value })} />
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs text-white/60">
              Host wall: {selectedWallHostGuid ?? 'Select a wall in the viewer'}
            </div>
          </>
        )}

        {activeTool === 'window' && (
          <>
            <DimensionInput label="Width" value={dims.width} onChange={(value) => setDims({ ...dims, width: value })} />
            <DimensionInput label="Height" value={dims.height} onChange={(value) => setDims({ ...dims, height: value })} />
            <DimensionInput label="Sill Height" value={dims.sillHeight ?? 900} onChange={(value) => setDims({ ...dims, sillHeight: value })} />
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs text-white/60">
              Host wall: {selectedWallHostGuid ?? 'Select a wall in the viewer'}
            </div>
          </>
        )}

        {activeTool === 'stair' && (
          <>
            <DimensionInput label="Width" value={dims.width} onChange={(value) => setDims({ ...dims, width: value })} />
            <DimensionInput label="Run" value={dims.depth} onChange={(value) => setDims({ ...dims, depth: value })} />
            <DimensionInput label="Height" value={dims.height} onChange={(value) => setDims({ ...dims, height: value })} />
            <section className="space-y-3">
              <Label>Template</Label>
              <select
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
                className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-sm"
              >
                <option value="straight">Straight</option>
              </select>
            </section>
          </>
        )}

        {activeTool === 'roof' && (
          <>
            <DimensionInput label="Length" value={dims.length} onChange={(value) => setDims({ ...dims, length: value })} />
            <DimensionInput label="Width" value={dims.width} onChange={(value) => setDims({ ...dims, width: value })} />
            <DimensionInput label="Rise" value={dims.height} onChange={(value) => setDims({ ...dims, height: value })} />
            <DimensionInput label="Thickness" value={dims.thickness} onChange={(value) => setDims({ ...dims, thickness: value })} />
            <DimensionInput label="Pitch" value={dims.pitch ?? 30} unit="deg" onChange={(value) => setDims({ ...dims, pitch: value })} />
            <section className="space-y-3">
              <Label>Template</Label>
              <select
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
                className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-sm"
              >
                <option value="flat">Flat</option>
                <option value="gable">Gable</option>
                <option value="shed">Shed</option>
              </select>
            </section>
          </>
        )}

        {activeTool === 'delete' && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-200">
            Delete applies to the currently selected element.
          </div>
        )}

        {activeTool === 'move' && (
          <>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs text-white/60">
              Target element: {selectedElementId ?? 'Select an element in the viewer'}
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs text-white/60">
              {selectedElementType === 'door' || selectedElementType === 'window'
                ? 'Click near another wall to move and re-host the selected opening.'
                : 'Click a new base point in the viewer to move the selected element.'}
            </div>
          </>
        )}

        {activeTool === 'rotate' && (
          <>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs text-white/60">
              Target element: {selectedElementId ?? 'Select an element in the viewer'}
            </div>
            <DimensionInput
              label="Rotation"
              value={dims.rotation ?? 0}
              unit="deg"
              onChange={(value) => setDims({ ...dims, rotation: value })}
            />
          </>
        )}

        <section className="rounded-3xl border border-white/5 bg-white/[0.02] p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-white/30">Draft</div>
          <div className="text-xs text-white/70 break-all">
            {JSON.stringify(authoringDraft, null, 2)}
          </div>
          {sessionPreview && (
            <div className="pt-2 text-[11px] text-amber-300">
              Preview ready: {sessionPreview.label}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-white/5 bg-white/[0.02] p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-white/30">Presence</div>
          {presence.length === 0 ? (
            <div className="text-xs text-white/40">No active sessions.</div>
          ) : (
            presence.map((item) => (
              <div key={item.session_id} className="flex items-center justify-between text-xs text-white/70">
                <span>{item.display_name}</span>
                <span className="text-white/30">{item.selection ?? 'idle'}</span>
              </div>
            ))
          )}
        </section>

        <section className="rounded-3xl border border-white/5 bg-white/[0.02] p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-white/30">Locks</div>
          {locks.length === 0 ? (
            <div className="text-xs text-white/40">No active locks.</div>
          ) : (
            locks.map((lock) => (
              <div key={lock.lock_id} className="flex items-center justify-between text-xs text-white/70">
                <span>{lock.label}</span>
                <span className="text-white/30">{lock.session_id}</span>
              </div>
            ))
          )}
        </section>
      </div>

      <div className="p-4 border-t border-white/5 bg-white/[0.01] space-y-3">
        {status && <div className="text-xs text-white/60">{status}</div>}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => void submitOperation('preview')}
            disabled={!isSupported || isSubmitting || activeTool === 'select'}
            className="glass-button rounded-2xl py-3 text-[11px] font-black uppercase tracking-wider disabled:opacity-40"
          >
            Preview
          </button>
          <button
            onClick={() => void submitOperation('apply')}
            disabled={!isSupported || isSubmitting || activeTool === 'select'}
            className="rounded-2xl py-3 text-[11px] font-black uppercase tracking-wider bg-primary text-white disabled:opacity-40"
          >
            Apply
          </button>
          <button
            onClick={() => void submitOperation('cancel')}
            disabled={isSubmitting}
            className="glass-button rounded-2xl py-3 text-[11px] font-black uppercase tracking-wider disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

const Label = ({ children }: { children: ReactNode }) => (
  <div className="text-[10px] uppercase tracking-widest text-white/30">{children}</div>
)

const DimensionInput = ({
  label,
  value,
  onChange,
  unit = 'mm',
}: {
  label: string
  value: number | undefined
  onChange: (value: number) => void
  unit?: string
}) => (
  <section className="space-y-3">
    <Label>{label} ({unit})</Label>
    <input
      type="number"
      value={value ?? ''}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-sm"
    />
  </section>
)
