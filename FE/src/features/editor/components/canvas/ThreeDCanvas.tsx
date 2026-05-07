import { useRef } from 'react'
import type { FloorLayerOverlay, FloorRoom, IfcElementChange, IfcElementInfo } from '../../types'
import { useCtrlWheelZoom } from '../../hooks/useCtrlWheelZoom'
import { useThreeDLibraryPresets } from '../../hooks/useThreeDLibraryPresets'
import ThatOpenIfcCanvas from './ThatOpenIfcCanvas'
import ThreeDLibraryPanel from './ThreeDLibraryPanel'

interface ThreeDCanvasProps {
  projectId?: string | null
  /** WS 또는 초기 로드에서 발급된 IFC presigned URL */
  ifcUrl?: string | null
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
  onIfcElementDelete?: (element: IfcElementInfo) => void
}

export function ThreeDCanvas(props: ThreeDCanvasProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const effectiveIfcUrl = props.ifcUrl === null ? '' : (props.ifcUrl ?? '/mock/shinchan_house.ifc')
  const {
    selectedCategory,
    setSelectedCategory,
    libraryElements,
    addLibraryPreset,
    changeLibraryElement,
    deleteLibraryElement,
  } = useThreeDLibraryPresets({
    onPresetAdded: props.onToggleLibrary,
  })

  useCtrlWheelZoom({
    rootRef,
    onWheelZoom: props.onWheelZoom,
  })

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 overflow-hidden bg-[#F0F2F9] select-none"
    >
      <ThatOpenIfcCanvas
        ifcUrl={effectiveIfcUrl}
        projectId={props.projectId}
        libraryElements={libraryElements}
        ifcElementChanges={props.ifcElementChanges ?? []}
        isRotationLocked={props.isRotationLocked ?? false}
        zoomScale={props.scale ?? 1}
        selectedIfcElement={props.selectedIfcElement}
        onIfcElementSelect={props.onIfcElementSelect}
        onIfcElementDelete={props.onIfcElementDelete}
        onLibraryElementChange={changeLibraryElement}
        onLibraryElementDelete={deleteLibraryElement}
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
          onAddPreset={addLibraryPreset}
        />
      )}
    </div>
  )
}
