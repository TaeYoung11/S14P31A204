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

/**
 * 3D IFC 요소 속성 편집(재질/색/치수) 로직을 모듈화한다.
 * - 3D + 선택 IFC 요소일 때만 로컬 IFC 상태를 갱신한다.
 * - 그 외 모드/대상은 기존 2D 패널 핸들러로 위임한다.
 */
export function useThreeDIfcAttributeHandlers({
  mode,
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
    mode,
    recordIfcElementChange,
    selectedIfcElementId,
    setSelectedIfcElement,
  ])

  const handleColorChangeForPanel = useCallback((id: string, color: string) => {
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
    mode,
    recordIfcElementChange,
    selectedIfcElementId,
    setSelectedIfcElement,
  ])

  const handleWidthChangeForPanel = useCallback((id: string, widthMm: number) => {
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
    mode,
    recordIfcElementChange,
    selectedIfcElementId,
    setSelectedIfcElement,
  ])

  const handleHeightChangeForPanel = useCallback((id: string, heightMm: number) => {
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
    mode,
    recordIfcElementChange,
    selectedIfcElementId,
    setSelectedIfcElement,
  ])

  const handleThicknessChangeForPanel = useCallback((id: string, thicknessMm: number) => {
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
  }, [mode, recordIfcElementChange, selectedIfcElementId, setSelectedIfcElement])

  return {
    handleMaterialChangeForPanel,
    handleColorChangeForPanel,
    handleWidthChangeForPanel,
    handleHeightChangeForPanel,
    handleThicknessChangeForPanel,
  }
}

