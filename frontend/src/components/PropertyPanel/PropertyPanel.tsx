import type { ComponentType } from 'react'
import { Box, Layers, Ruler, Tag } from 'lucide-react'
import { useStore } from '../../stores/useStore'

const formatValue = (value: unknown): string => {
  if (value == null) return '-'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) return `[${value.length} items]`
  if (typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).value)
  }
  return JSON.stringify(value)
}

const readIfcDisplayValue = (value: unknown): string | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }
  if (value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    const nested = (value as Record<string, unknown>).value
    if (typeof nested === 'string' || typeof nested === 'number') {
      return String(nested)
    }
  }
  return null
}

export const PropertyPanel = () => {
  const selectedId = useStore((state) => state.selectedElementId)
  const properties = useStore((state) => state.selectedElementProperties)

  if (!selectedId || !properties) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center opacity-30 select-none">
        <Box className="w-12 h-12 mb-4" />
        <p className="text-xs font-medium italic leading-relaxed">
          Select an element in the viewer to inspect
          <br />
          IFC attributes and use them in authoring actions.
        </p>
      </div>
    )
  }

  const entries = Object.entries(properties).slice(0, 18)
  const elementType =
    readIfcDisplayValue(properties['type']) ??
    readIfcDisplayValue(properties['__category']) ??
    readIfcDisplayValue(properties['category']) ??
    'IfcBuildingElement'

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="p-6 bg-white/[0.03] border-b border-white/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Tag className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white/90">
              {formatValue(properties['Name'] ?? properties['LongName'] ?? 'Selected Element')}
            </h3>
            <p className="text-[10px] text-white/40 font-mono tracking-tighter uppercase">{selectedId}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        <section>
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-4">
            General Info
          </h4>
          <div className="space-y-3">
            <PropertyItem icon={Box} label="IFC Type" value={String(elementType)} />
            <PropertyItem icon={Layers} label="GlobalId" value={formatValue(properties['GlobalId'])} />
            <PropertyItem icon={Ruler} label="Express ID" value={formatValue(properties['expressID'])} />
          </div>
        </section>

        <section>
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-4">
            Attributes
          </h4>
          <div className="space-y-3">
            {entries.map(([key, value]) => (
              <PropertyItem key={key} icon={Tag} label={key} value={formatValue(value)} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

const PropertyItem = ({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
}) => (
  <div className="flex items-center justify-between py-1 gap-3">
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="w-3.5 h-3.5 text-white/20" />
      <span className="text-xs text-white/40 truncate">{label}</span>
    </div>
    <span className="text-xs font-medium text-white/80 text-right break-all">{value}</span>
  </div>
)
