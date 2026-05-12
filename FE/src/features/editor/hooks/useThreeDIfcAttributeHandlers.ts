import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { EditorMode, IfcElementChange, IfcElementInfo } from '../types'

const THREE_D_MATERIAL_COLOR: Record<string, string> = {
  Concrete: '#A8A29E',
  Brick: '#A3472C',
  Steel: '#8A94A3',
  Wood: '#9A6232',
  Glass: '#8FD3FF',
  Stone: '#8D8D86',
  Tile: '#C56F45',
}

interface UseThreeDIfcAttributeHandlersParams {
  mode: EditorMode
  canEditThreeDAttributes: boolean
  selectedIfcElement: IfcElementInfo | null
  setSelectedIfcElement: Dispatch<SetStateAction<IfcElementInfo | null>>
  recordIfcElementChange: (
    element: IfcElementInfo | null,
    patch: Omit<IfcElementChange, 'expressId'>,
  ) => void
  baseHandleMaterialChangeForPanel: (id: string, material: string) => void
  baseHandleColorChangeForPanel: (id: string, color: string) => void
  baseHandleWidthChangeForPanel: (id: string, widthMm: number) => void
  baseHandleHeightChangeForPanel: (id: string, heightMm: number) => void
}

type PositionAxis = 'x' | 'y' | 'z'
type RotationAxis = 'x' | 'y' | 'z'
type RoofShape = 'flat' | 'gable'

/**
 * 3D IFC 요소 속성 편집(재질/색/치수) 로직을 모듈화한다.
 * - 3D + 선택 IFC 요소일 때만 로컬 IFC 상태를 갱신한다.
 * - 그 외 모드/대상은 기존 2D 패널 핸들러로 위임한다.
 */
export function useThreeDIfcAttributeHandlers({
  mode,
  canEditThreeDAttributes,
  selectedIfcElement,
  setSelectedIfcElement,
  recordIfcElementChange,
  baseHandleMaterialChangeForPanel,
  baseHandleColorChangeForPanel,
  baseHandleWidthChangeForPanel,
  baseHandleHeightChangeForPanel,
}: UseThreeDIfcAttributeHandlersParams) {
  const selectedIfcElementId = selectedIfcElement?.id

  const handleMaterialChangeForPanel = useCallback((id: string, material: string) => {
    if (!canEditThreeDAttributes && mode === '3d') return
    if (mode !== '3d' || selectedIfcElementId !== id) {
      baseHandleMaterialChangeForPanel(id, material)
      return
    }

    setSelectedIfcElement((prev) => {
      if (!prev || prev.id !== id) return prev
      const color = THREE_D_MATERIAL_COLOR[material] ?? prev.color
      const next = {
        ...prev,
        material,
        color,
        properties: {
          ...prev.properties,
          Material: material,
          Color: color ?? '-',
        },
      }
      recordIfcElementChange(next, { material, color })
      return next
    })
  }, [
    baseHandleMaterialChangeForPanel,
    canEditThreeDAttributes,
    mode,
    recordIfcElementChange,
    selectedIfcElementId,
    setSelectedIfcElement,
  ])

  const handleColorChangeForPanel = useCallback((id: string, color: string) => {
    if (!canEditThreeDAttributes && mode === '3d') return
    if (mode !== '3d' || selectedIfcElementId !== id) {
      baseHandleColorChangeForPanel(id, color)
      return
    }

    setSelectedIfcElement((prev) => {
      if (!prev || prev.id !== id) return prev
      const next = {
        ...prev,
        color,
        properties: {
          ...prev.properties,
          Color: color,
        },
      }
      recordIfcElementChange(next, { color, material: prev.material })
      return next
    })
  }, [
    baseHandleColorChangeForPanel,
    canEditThreeDAttributes,
    mode,
    recordIfcElementChange,
    selectedIfcElementId,
    setSelectedIfcElement,
  ])

  const handleWidthChangeForPanel = useCallback((id: string, widthMm: number) => {
    if (!canEditThreeDAttributes && mode === '3d') return
    if (mode !== '3d' || selectedIfcElementId !== id) {
      baseHandleWidthChangeForPanel(id, widthMm)
      return
    }

    setSelectedIfcElement((prev) => {
      if (!prev || prev.id !== id) return prev
      const next = {
        ...prev,
        lengthMm: widthMm,
        properties: {
          ...prev.properties,
          Length: widthMm,
        },
      }
      recordIfcElementChange(next, { lengthMm: widthMm })
      return next
    })
  }, [
    baseHandleWidthChangeForPanel,
    canEditThreeDAttributes,
    mode,
    recordIfcElementChange,
    selectedIfcElementId,
    setSelectedIfcElement,
  ])

  const handleHeightChangeForPanel = useCallback((id: string, heightMm: number) => {
    if (!canEditThreeDAttributes && mode === '3d') return
    if (mode !== '3d' || selectedIfcElementId !== id) {
      baseHandleHeightChangeForPanel(id, heightMm)
      return
    }

    setSelectedIfcElement((prev) => {
      if (!prev || prev.id !== id) return prev
      const next = {
        ...prev,
        heightMm,
        properties: {
          ...prev.properties,
          Height: heightMm,
        },
      }
      recordIfcElementChange(next, { heightMm })
      return next
    })
  }, [
    baseHandleHeightChangeForPanel,
    canEditThreeDAttributes,
    mode,
    recordIfcElementChange,
    selectedIfcElementId,
    setSelectedIfcElement,
  ])

  const handleThicknessChangeForPanel = useCallback((id: string, thicknessMm: number) => {
    if (!canEditThreeDAttributes && mode === '3d') return
    if (mode !== '3d' || selectedIfcElementId !== id) return

    setSelectedIfcElement((prev) => {
      if (!prev || prev.id !== id) return prev
      const next = {
        ...prev,
        thicknessMm,
        properties: {
          ...prev.properties,
          Thickness: thicknessMm,
        },
      }
      recordIfcElementChange(next, { thicknessMm })
      return next
    })
  }, [canEditThreeDAttributes, mode, recordIfcElementChange, selectedIfcElementId, setSelectedIfcElement])

  const handlePositionChangeForPanel = useCallback((id: string, axis: PositionAxis, value: number) => {
    if (!canEditThreeDAttributes && mode === '3d') return
    if (mode !== '3d' || selectedIfcElementId !== id) return

    setSelectedIfcElement((prev) => {
      if (!prev || prev.id !== id) return prev
      const nextPositionX = axis === 'x' ? value : prev.positionX
      const nextPositionY = axis === 'y' ? value : prev.positionY
      const nextPositionZ = axis === 'z' ? value : prev.positionZ
      return {
        ...prev,
        positionX: nextPositionX,
        positionY: nextPositionY,
        positionZ: nextPositionZ,
        properties: {
          ...prev.properties,
          PositionX: Number((nextPositionX ?? 0).toFixed(3)),
          PositionY: Number((nextPositionY ?? 0).toFixed(3)),
          PositionZ: Number((nextPositionZ ?? 0).toFixed(3)),
        },
      }
    })
    recordIfcElementChange(selectedIfcElement, {
      positionX: axis === 'x' ? value : selectedIfcElement?.positionX,
      positionY: axis === 'y' ? value : selectedIfcElement?.positionY,
      positionZ: axis === 'z' ? value : selectedIfcElement?.positionZ,
    })
  }, [canEditThreeDAttributes, mode, recordIfcElementChange, selectedIfcElement, selectedIfcElementId, setSelectedIfcElement])

  const handleRotationChangeForPanel = useCallback((id: string, axis: RotationAxis, degrees: number) => {
    if (!canEditThreeDAttributes && mode === '3d') return
    if (mode !== '3d' || selectedIfcElementId !== id) return

    setSelectedIfcElement((prev) => {
      if (!prev || prev.id !== id) return prev
      const nextRotationX = axis === 'x' ? degrees : prev.rotationX
      const nextRotationY = axis === 'y' ? degrees : prev.rotationY
      const nextRotationZ = axis === 'z' ? degrees : prev.rotationZ
      return {
        ...prev,
        rotationX: nextRotationX,
        rotationY: nextRotationY,
        rotationZ: nextRotationZ,
        properties: {
          ...prev.properties,
          RotationX: Number((nextRotationX ?? 0).toFixed(2)),
          RotationY: Number((nextRotationY ?? 0).toFixed(2)),
          RotationZ: Number((nextRotationZ ?? 0).toFixed(2)),
        },
      }
    })
    recordIfcElementChange(selectedIfcElement, {
      rotationX: axis === 'x' ? degrees : selectedIfcElement?.rotationX,
      rotationY: axis === 'y' ? degrees : selectedIfcElement?.rotationY,
      rotationZ: axis === 'z' ? degrees : selectedIfcElement?.rotationZ,
    })
  }, [canEditThreeDAttributes, mode, recordIfcElementChange, selectedIfcElement, selectedIfcElementId, setSelectedIfcElement])

  const handleRoofShapeChangeForPanel = useCallback((id: string, shape: RoofShape) => {
    if (!canEditThreeDAttributes && mode === '3d') return
    if (mode !== '3d' || selectedIfcElementId !== id) return

    setSelectedIfcElement((prev) => {
      if (!prev || prev.id !== id) return prev
      return {
        ...prev,
        roofShape: shape,
        properties: {
          ...prev.properties,
          RoofShape: shape,
        },
      }
    })

    recordIfcElementChange(selectedIfcElement, { roofShape: shape })
  }, [canEditThreeDAttributes, mode, recordIfcElementChange, selectedIfcElement, selectedIfcElementId, setSelectedIfcElement])

  return {
    handleMaterialChangeForPanel,
    handleColorChangeForPanel,
    handleWidthChangeForPanel,
    handleHeightChangeForPanel,
    handleThicknessChangeForPanel,
    handlePositionChangeForPanel,
    handleRotationChangeForPanel,
    handleRoofShapeChangeForPanel,
  }
}
