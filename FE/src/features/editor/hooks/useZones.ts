import { useCallback, useMemo, useState } from 'react'
import type { ZoneData, ZoningFormData, BubbleData } from '../types'
import { DEFAULT_AUTO_ZONE_COLOR } from '../constants'
import { normalizeColorValue, resolveAutoZoneColor } from '../utils/bubbleCalc'
import { pruneZoneBubbleIds } from '../utils/editorPageHelpers'

const INITIAL_FORM: ZoningFormData = {
  name: '',
  color: DEFAULT_AUTO_ZONE_COLOR,
  bubbleIds: [],
  colorMode: 'manual',
}

const createInitialForm = (): ZoningFormData => ({ ...INITIAL_FORM, bubbleIds: [] })

function resolveZoneName(inputName: string, fallbackIndex: number): string {
  const trimmed = inputName.trim()
  return trimmed.length > 0 ? trimmed : `조닝 ${fallbackIndex}`
}

function buildUniqueBubbleIds(
  bubbleIds: string[],
  allowedBubbleIds?: Set<string>,
): string[] {
  return Array.from(
    new Set(
      bubbleIds.filter((bubbleId) => (allowedBubbleIds ? allowedBubbleIds.has(bubbleId) : true)),
    ),
  )
}

function generateZoneId(): string {
  const randomUuid = globalThis.crypto?.randomUUID
  if (typeof randomUuid === 'function') {
    return `zone-${randomUuid.call(globalThis.crypto)}`
  }
  return `zone-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 조닝 상태와 조닝 모달 폼 핸들러를 제공하는 훅
 * @param bubbles 자동 색상 계산에 필요한 버블 목록
 */
export function useZones(bubbles: BubbleData[], initialZones: ZoneData[] = []) {
  const [zones, setZones] = useState<ZoneData[]>(initialZones)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null)
  const [formData, setFormData] = useState<ZoningFormData>(createInitialForm)

  /** 선택된 버블 색상 기준으로 자동 색상 미리보기 */
  const autoColorPreview = useMemo(() => {
    const bubble = bubbles.find((b) => formData.bubbleIds.includes(b.id))
    return resolveAutoZoneColor(bubble?.color, DEFAULT_AUTO_ZONE_COLOR)
  }, [bubbles, formData.bubbleIds])

  /** 신규 조닝 추가 모달 열기 */
  const openAddModal = useCallback(() => {
    setEditingZoneId(null)
    setFormData(createInitialForm())
    setIsModalOpen(true)
  }, [])

  /** 기존 조닝 수정 모달 열기 */
  const openEditModal = useCallback((zone: ZoneData) => {
    setEditingZoneId(zone.id)
    setFormData({
      name: zone.name,
      color: zone.color,
      bubbleIds: [...zone.bubbleIds],
      colorMode: zone.source,
    })
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
    setEditingZoneId(null)
  }, [])

  /** 포함 공간 토글 선택/해제 */
  const toggleBubble = useCallback((bubbleId: string) => {
    setFormData((prev) => ({
      ...prev,
      bubbleIds: prev.bubbleIds.includes(bubbleId)
        ? prev.bubbleIds.filter((id) => id !== bubbleId)
        : [...prev.bubbleIds, bubbleId],
    }))
  }, [])

  /** 조닝 생성 또는 수정 확정 — 실제 변경이 발생하면 true 반환 */
  const confirmModal = useCallback((allowedBubbleIds?: Set<string>): boolean => {
    const uniqueIds = buildUniqueBubbleIds(formData.bubbleIds, allowedBubbleIds)
    if (uniqueIds.length === 0) return false

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
            : z,
        ),
      )
    } else {
      setZones((prev) => {
        const name = resolveZoneName(formData.name, prev.length + 1)
        return [
          ...prev,
          { id: generateZoneId(), name, color: zoneColor, bubbleIds: uniqueIds, source: formData.colorMode },
        ]
      })
    }
    closeModal()
    return true
  }, [bubbles, closeModal, editingZoneId, formData])

  /** 조닝 삭제 (수정 중인 조닝이면 모달도 닫기) */
  const deleteZone = useCallback((zoneId: string) => {
    setZones((prev) => prev.filter((z) => z.id !== zoneId))
    if (editingZoneId === zoneId) closeModal()
  }, [closeModal, editingZoneId])

  /** 삭제된 버블 id들을 모든 조닝에서 제거한다. */
  const removeBubbleIds = useCallback((bubbleIds: Iterable<string>) => {
    const removedBubbleIdSet = new Set(bubbleIds)
    if (removedBubbleIdSet.size === 0) return

    setZones((prev) => pruneZoneBubbleIds(prev, removedBubbleIdSet))
    setFormData((prev) => {
      const nextBubbleIds = prev.bubbleIds.filter((bubbleId) => !removedBubbleIdSet.has(bubbleId))
      return nextBubbleIds.length === prev.bubbleIds.length
        ? prev
        : { ...prev, bubbleIds: nextBubbleIds }
    })
  }, [])

  const replaceZonesState = useCallback((nextZones: ZoneData[]) => {
    setZones(nextZones)
    setIsModalOpen(false)
    setEditingZoneId(null)
    setFormData(createInitialForm())
  }, [])

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
    removeBubbleIds,
    replaceZonesState,
  }
}
