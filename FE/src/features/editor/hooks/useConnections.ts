import { useState } from 'react'
import type { ConnectionData, ConnectionStyle, ConnectionPair } from '../types'

/** 연결선 상태와 선 스타일 모달 핸들러를 제공하는 훅 */
export function useConnections() {
  const [connections, setConnections] = useState<ConnectionData[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedStyle, setSelectedStyle] = useState<ConnectionStyle>('thin')
  const [connectionPair, setConnectionPair] = useState<ConnectionPair | null>(null)

  /** 연결선 추가 또는 업데이트 (같은 쌍이면 스타일만 변경) */
  const upsertConnection = (from: string, to: string, type: ConnectionStyle) => {
    if (!from || !to || from === to) return
    setConnections((prev) => {
      const idx = prev.findIndex(
        (c) => (c.from === from && c.to === to) || (c.from === to && c.to === from)
      )
      if (idx === -1) return [...prev, { from, to, type }]
      return prev.map((c, i) => (i === idx ? { ...c, type } : c))
    })
  }

  /**
   * 선 스타일 모달 열기
   * 직전에 선택된 버블 쌍이 있으면 자동으로 연결 대상으로 설정
   */
  const openModal = (selectedId: string | null, previousSelectedId: string | null) => {
    setSelectedStyle('thin')
    if (selectedId && previousSelectedId && selectedId !== previousSelectedId) {
      setConnectionPair({ from: previousSelectedId, to: selectedId })
    } else {
      setConnectionPair(null)
    }
    setIsModalOpen(true)
  }

  /**
   * 연결 쌍을 직접 지정해 모달 열기
   * 연결 도구로 두 버블 선택 시 / 연결선 클릭으로 스타일 변경 시 사용
   */
  const openModalWithPair = (from: string, to: string, existingStyle?: ConnectionStyle) => {
    setSelectedStyle(existingStyle ?? 'thin')
    setConnectionPair({ from, to })
    setIsModalOpen(true)
  }

  /** 선 스타일 적용 확인 */
  const confirmModal = () => {
    if (!connectionPair) return
    upsertConnection(connectionPair.from, connectionPair.to, selectedStyle)
    setIsModalOpen(false)
  }

  /** 특정 버블과 연결된 모든 연결선 삭제 (버블 삭제 시 호출) */
  const removeConnectionsForBubble = (id: string) => {
    setConnections((prev) => prev.filter((c) => c.from !== id && c.to !== id))
  }

  return {
    connections,
    isModalOpen,
    selectedStyle,
    connectionPair,
    openModal,
    openModalWithPair,
    confirmModal,
    closeModal: () => setIsModalOpen(false),
    setSelectedStyle,
    removeConnectionsForBubble,
  }
}
