import { useState, useMemo } from 'react'
import type { ZoneData, ZoningFormData, BubbleData } from '../types'
import { DEFAULT_AUTO_ZONE_COLOR } from '../constants'
import { normalizeColorValue, resolveAutoZoneColor } from '../utils/bubbleCalc'

const INITIAL_FORM: ZoningFormData = {
  name: '',
  color: DEFAULT_AUTO_ZONE_COLOR,
  bubbleIds: [],
  colorMode: 'manual',
}

/**
 * 조닝 상태와 조닝 모달 폼 핸들러를 제공하는 훅
 * @param bubbles 자동 색상 계산에 필요한 버블 목록
 */
export function useZones(bubbles: BubbleData[]) {
  const [zones, setZones] = useState<ZoneData[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null)
  const [formData, setFormData] = useState<ZoningFormData>(INITIAL_FORM)

  /** 선택된 버블 색상 기준으로 자동 색상 미리보기 */
  const autoColorPreview = useMemo(() => {
    const bubble = bubbles.find((b) => formData.bubbleIds.includes(b.id))
    return resolveAutoZoneColor(bubble?.color, DEFAULT_AUTO_ZONE_COLOR)
  }, [bubbles, formData.bubbleIds])

  /** 신규 조닝 추가 모달 열기 */
  const openAddModal = () => {
    setEditingZoneId(null)
    setFormData(INITIAL_FORM)
    setIsModalOpen(true)
  }

  /** 기존 조닝 수정 모달 열기 */
  const openEditModal = (zone: ZoneData) => {
    setEditingZoneId(zone.id)
    setFormData({
      name: zone.name,
      color: zone.color,
      bubbleIds: [...zone.bubbleIds],
      colorMode: zone.source,
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingZoneId(null)
  }

  /** 포함 공간 토글 선택/해제 */
  const toggleBubble = (bubbleId: string) => {
    setFormData((prev) => ({
      ...prev,
      bubbleIds: prev.bubbleIds.includes(bubbleId)
        ? prev.bubbleIds.filter((id) => id !== bubbleId)
        : [...prev.bubbleIds, bubbleId],
    }))
  }

  /** 조닝 생성 또는 수정 확정 */
  const confirmModal = () => {
    const uniqueIds = Array.from(new Set(formData.bubbleIds))
    if (uniqueIds.length === 0) return

    const bubble = bubbles.find((b) => uniqueIds.includes(b.id))
    const zoneColor =
      formData.colorMode === 'auto'
        ? resolveAutoZoneColor(bubble?.color, DEFAULT_AUTO_ZONE_COLOR)
        : normalizeColorValue(formData.color)

    if (editingZoneId) {
      setZones((prev) =>
        prev.map((z) =>
          z.id === editingZoneId
            ? { ...z, name: formData.name.trim() || z.name, color: zoneColor, bubbleIds: uniqueIds, source: formData.colorMode }
            : z
        )
      )
    } else {
      setZones((prev) => {
        const name = formData.name.trim() || `조닝 ${prev.length + 1}`
        return [
          ...prev,
          { id: `zone-${Date.now()}`, name, color: zoneColor, bubbleIds: uniqueIds, source: formData.colorMode },
        ]
      })
    }
    closeModal()
  }

  /** 조닝 삭제 (수정 중인 조닝이면 모달도 닫기) */
  const deleteZone = (zoneId: string) => {
    setZones((prev) => prev.filter((z) => z.id !== zoneId))
    if (editingZoneId === zoneId) closeModal()
  }

  return {
    zones,
    isModalOpen,
    editingZoneId,
    formData,
    setFormData,
    autoColorPreview,
    openAddModal,
    openEditModal,
    closeModal,
    toggleBubble,
    confirmModal,
    deleteZone,
  }
}
