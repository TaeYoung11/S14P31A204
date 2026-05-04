import { useEffect, useRef, useState } from 'react'
import type { FloorLayerOverlay, FloorRoom, IfcElementChange, IfcElementInfo } from '../../types'
import ThatOpenIfcCanvas from './ThatOpenIfcCanvas'
import ThreeDLibraryPanel, { type ThreeDLibraryPreset } from './ThreeDLibraryPanel'

interface ThreeDCanvasProps {
  sitePoints?: number[]
  isCollaborationMode?: boolean
  isLibraryOpen?: boolean
  onToggleLibrary?: () => void
  isGridVisible?: boolean
  rooms?: FloorRoom[]
  overlayLayers?: FloorLayerOverlay[]
  scale?: number
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  selectedTool?: string
  onWheelZoom?: (factor: number) => void
  isRotationLocked?: boolean
  ifcElementChanges?: IfcElementChange[]
  selectedIfcElement?: IfcElementInfo | null
  onIfcElementSelect?: (element: IfcElementInfo | null) => void
}

// TODO: Replace this mock file with the project model API URL when backend model storage is connected.
const MOCK_IFC_URL = '/mock/shinchan_house.ifc'

export function ThreeDCanvas(props: ThreeDCanvasProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [libraryElements, setLibraryElements] = useState<ThreeDLibraryPreset[]>([])
  const { onWheelZoom } = props

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

      const handleWheel = (event: WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) return
        event.preventDefault()
      onWheelZoom?.(event.deltaY < 0 ? 1.1 : 0.9)
    }

    root.addEventListener('wheel', handleWheel, { passive: false })
    return () => root.removeEventListener('wheel', handleWheel)
  }, [onWheelZoom])

  const handleAddLibraryPreset = (preset: ThreeDLibraryPreset) => {
    setLibraryElements((prev) => [
      ...prev,
      {
        ...preset,
        id: `${preset.id}-${Date.now()}-${prev.length}`,
      },
    ])
    props.onToggleLibrary?.()
  }

  const handleLibraryElementChange = (id: string, patch: Partial<ThreeDLibraryPreset>) => {
    setLibraryElements((prev) =>
      prev.map((element) => (element.id === id ? { ...element, ...patch } : element)),
    )
  }

  const handleLibraryElementDelete = (id: string) => {
    setLibraryElements((prev) => prev.filter((element) => element.id !== id))
  }

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 overflow-hidden bg-[#F0F2F9] select-none"
    >
      <ThatOpenIfcCanvas
        ifcUrl={MOCK_IFC_URL}
        libraryElements={libraryElements}
        ifcElementChanges={props.ifcElementChanges ?? []}
        isRotationLocked={props.isRotationLocked ?? false}
        zoomScale={props.scale ?? 1}
        selectedIfcElement={props.selectedIfcElement}
        onIfcElementSelect={props.onIfcElementSelect}
        onLibraryElementChange={handleLibraryElementChange}
        onLibraryElementDelete={handleLibraryElementDelete}
      />

      {props.isGridVisible && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute bottom-[-20%] left-[-20%] right-[-20%] top-[-20%]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(59,69,179,0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(59,69,179,0.1) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
              transform: 'perspective(1200px) rotateX(60deg)',
              transformOrigin: 'center center',
            }}
          />
        </div>
      )}

      {props.isCollaborationMode && (
        <div className="pointer-events-none absolute inset-0 bg-[#2A2E35]/20" />
      )}

      {props.isLibraryOpen && (
        <ThreeDLibraryPanel
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onClose={props.onToggleLibrary ?? (() => {})}
          onAddPreset={handleAddLibraryPreset}
        />
      )}
    </div>
  )
}

