import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { BubbleInfo } from '../BubbleAttributePanel'
import type { FloorOpening, FloorWall } from '../../../types'

interface UseTwoDAttributeDraftsParams {
  selectedBubble: BubbleInfo | null
  selectedWall: FloorWall | null
  selectedOpening: FloorOpening | null
  isWallFirstEditing: boolean
  onWidthChange: (id: string, width: number) => void
  onHeightChange: (id: string, height: number) => void
  onWidthCommit?: (id: string, width: number) => void
  onHeightCommit?: (id: string, height: number) => void
  onWallThicknessChange?: (id: string, thicknessMm: number) => void
  onWallHeightChange?: (id: string, heightMm: number) => void
  onOpeningSizeChange?: (id: string, widthMm: number, heightMm: number) => void
  onWindowSillHeightChange?: (id: string, sillHeightMm: number) => void
}

const ROOM_DIMENSION_DEBOUNCE_MS = 220
const WALL_DIMENSION_DEBOUNCE_MS = 220

function clearDebounceTimer(timerRef: MutableRefObject<number | null>) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }
}

/**
 * 2D 속성 패널의 draft 입력값/디바운스 커밋을 관리한다.
 * - 선택 대상(Room/Wall/Opening) 변경 시 입력값 동기화
 * - 입력 중에는 draft 유지, blur 시 최종 커밋
 * - onChange 단계에서는 디바운스 커밋으로 과도한 업데이트를 방지
 */
export function useTwoDAttributeDrafts({
  selectedBubble,
  selectedWall,
  selectedOpening,
  isWallFirstEditing,
  onWidthChange,
  onHeightChange,
  onWidthCommit,
  onHeightCommit,
  onWallThicknessChange,
  onWallHeightChange,
  onOpeningSizeChange,
  onWindowSillHeightChange,
}: UseTwoDAttributeDraftsParams) {
  const [roomWidthDraft, setRoomWidthDraft] = useState('')
  const [roomHeightDraft, setRoomHeightDraft] = useState('')
  const [isWidthEditing, setIsWidthEditing] = useState(false)
  const [isHeightEditing, setIsHeightEditing] = useState(false)

  const [wallThicknessDraft, setWallThicknessDraft] = useState('')
  const [wallHeightDraft, setWallHeightDraft] = useState('')
  const [isWallThicknessEditing, setIsWallThicknessEditing] = useState(false)
  const [isWallHeightEditing, setIsWallHeightEditing] = useState(false)

  const [openingWidthDraft, setOpeningWidthDraft] = useState('')
  const [openingHeightDraft, setOpeningHeightDraft] = useState('')
  const [isOpeningWidthEditing, setIsOpeningWidthEditing] = useState(false)
  const [isOpeningHeightEditing, setIsOpeningHeightEditing] = useState(false)

  const [windowSillHeightDraft, setWindowSillHeightDraft] = useState('')
  const [isWindowSillHeightEditing, setIsWindowSillHeightEditing] = useState(false)

  const widthDebounceRef = useRef<number | null>(null)
  const heightDebounceRef = useRef<number | null>(null)
  const wallThicknessDebounceRef = useRef<number | null>(null)
  const wallHeightDebounceRef = useRef<number | null>(null)
  const openingWidthDebounceRef = useRef<number | null>(null)
  const openingHeightDebounceRef = useRef<number | null>(null)
  const windowSillHeightDebounceRef = useRef<number | null>(null)

  const queueRoomDimensionCommit = (
    value: string,
    timerRef: MutableRefObject<number | null>,
    onChange: (id: string, valueMm: number) => void,
  ) => {
    if (isWallFirstEditing) return
    if (!selectedBubble) return
    clearDebounceTimer(timerRef)
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 100) return
    timerRef.current = window.setTimeout(() => {
      onChange(selectedBubble.id, parsed)
      timerRef.current = null
    }, ROOM_DIMENSION_DEBOUNCE_MS)
  }

  const queueWallDimensionCommit = (
    value: string,
    timerRef: MutableRefObject<number | null>,
    onChange: ((id: string, valueMm: number) => void) | undefined,
  ) => {
    if (!selectedWall || !onChange) return
    clearDebounceTimer(timerRef)
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    timerRef.current = window.setTimeout(() => {
      onChange(selectedWall.id, parsed)
      timerRef.current = null
    }, WALL_DIMENSION_DEBOUNCE_MS)
  }

  const queueOpeningDimensionCommit = (
    widthValue: string,
    heightValue: string,
    timerRef: MutableRefObject<number | null>,
  ) => {
    if (!selectedOpening || !onOpeningSizeChange) return
    clearDebounceTimer(timerRef)
    const widthParsed = Number(widthValue)
    const heightParsed = Number(heightValue)
    if (!Number.isFinite(widthParsed) || !Number.isFinite(heightParsed) || widthParsed <= 0 || heightParsed <= 0) return
    timerRef.current = window.setTimeout(() => {
      onOpeningSizeChange(selectedOpening.id, widthParsed, heightParsed)
      timerRef.current = null
    }, ROOM_DIMENSION_DEBOUNCE_MS)
  }

  const queueWindowSillHeightCommit = (value: string) => {
    if (!selectedOpening || selectedOpening.type !== 'window' || !onWindowSillHeightChange) return
    clearDebounceTimer(windowSillHeightDebounceRef)
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) return
    windowSillHeightDebounceRef.current = window.setTimeout(() => {
      onWindowSillHeightChange(selectedOpening.id, parsed)
      windowSillHeightDebounceRef.current = null
    }, ROOM_DIMENSION_DEBOUNCE_MS)
  }

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      if (!selectedBubble) {
        setRoomWidthDraft('')
        setRoomHeightDraft('')
        return
      }
      if (!isWidthEditing) {
        setRoomWidthDraft(String(Math.round(selectedBubble.widthMm)))
      }
      if (!isHeightEditing) {
        setRoomHeightDraft(String(Math.round(selectedBubble.heightMm)))
      }
    }, 0)
    return () => window.clearTimeout(syncTimer)
  }, [selectedBubble, isWidthEditing, isHeightEditing])

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      if (!selectedWall) {
        setWallThicknessDraft('')
        setWallHeightDraft('')
        return
      }
      if (!isWallThicknessEditing) {
        setWallThicknessDraft(String(selectedWall.thickness))
      }
      if (!isWallHeightEditing) {
        setWallHeightDraft(String(selectedWall.heightMm))
      }
    }, 0)
    return () => window.clearTimeout(syncTimer)
  }, [selectedWall, isWallThicknessEditing, isWallHeightEditing])

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      if (!selectedOpening) {
        setOpeningWidthDraft('')
        setOpeningHeightDraft('')
        return
      }
      if (!isOpeningWidthEditing) {
        setOpeningWidthDraft(String(selectedOpening.widthMm))
      }
      if (!isOpeningHeightEditing) {
        setOpeningHeightDraft(String(selectedOpening.heightMm))
      }
      if (!isWindowSillHeightEditing) {
        setWindowSillHeightDraft(String(selectedOpening.sillHeightMm ?? 900))
      }
    }, 0)
    return () => window.clearTimeout(syncTimer)
  }, [selectedOpening, isOpeningWidthEditing, isOpeningHeightEditing, isWindowSillHeightEditing])

  useEffect(() => {
    return () => {
      clearDebounceTimer(widthDebounceRef)
      clearDebounceTimer(heightDebounceRef)
      clearDebounceTimer(wallThicknessDebounceRef)
      clearDebounceTimer(wallHeightDebounceRef)
      clearDebounceTimer(openingWidthDebounceRef)
      clearDebounceTimer(openingHeightDebounceRef)
      clearDebounceTimer(windowSillHeightDebounceRef)
    }
  }, [])

  useEffect(() => {
    clearDebounceTimer(widthDebounceRef)
    clearDebounceTimer(heightDebounceRef)
  }, [onWidthChange, onHeightChange])

  useEffect(() => {
    clearDebounceTimer(wallThicknessDebounceRef)
    clearDebounceTimer(wallHeightDebounceRef)
  }, [onWallThicknessChange, onWallHeightChange])

  useEffect(() => {
    clearDebounceTimer(openingWidthDebounceRef)
    clearDebounceTimer(openingHeightDebounceRef)
  }, [onOpeningSizeChange])

  useEffect(() => {
    clearDebounceTimer(windowSillHeightDebounceRef)
  }, [onWindowSillHeightChange])

  const commitRoomDimension = (params: {
    draftValue: string
    fallbackValueMm: number
    timerRef: MutableRefObject<number | null>
    onCommit: (id: string, valueMm: number) => void
    setDraft: (next: string) => void
    setEditing: (next: boolean) => void
  }) => {
    if (isWallFirstEditing) return
    if (!selectedBubble) return
    clearDebounceTimer(params.timerRef)
    const parsed = Number(params.draftValue)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      params.setDraft(String(Math.round(params.fallbackValueMm)))
      return
    }
    params.onCommit(selectedBubble.id, parsed)
    params.setEditing(false)
  }

  const commitOpeningDimension = (params: {
    widthValue: string
    heightValue: string
    fallbackWidthMm: number
    fallbackHeightMm: number
    timerRef: MutableRefObject<number | null>
    setWidthDraft: (next: string) => void
    setHeightDraft: (next: string) => void
  }) => {
    if (!selectedOpening || !onOpeningSizeChange) return
    clearDebounceTimer(params.timerRef)
    const widthParsed = Number(params.widthValue)
    const heightParsed = Number(params.heightValue)
    if (!Number.isFinite(widthParsed) || widthParsed <= 0) {
      params.setWidthDraft(String(params.fallbackWidthMm))
      return
    }
    if (!Number.isFinite(heightParsed) || heightParsed <= 0) {
      params.setHeightDraft(String(params.fallbackHeightMm))
      return
    }
    onOpeningSizeChange(selectedOpening.id, widthParsed, heightParsed)
  }

  const commitWindowSillHeight = () => {
    if (!selectedOpening || selectedOpening.type !== 'window' || !onWindowSillHeightChange) return
    clearDebounceTimer(windowSillHeightDebounceRef)
    const parsed = Number(windowSillHeightDraft)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setWindowSillHeightDraft(String(selectedOpening.sillHeightMm ?? 900))
      return
    }
    onWindowSillHeightChange(selectedOpening.id, parsed)
  }

  return {
    roomWidthDraft,
    roomHeightDraft,
    wallThicknessDraft,
    wallHeightDraft,
    openingWidthDraft,
    openingHeightDraft,
    windowSillHeightDraft,
    onRoomWidthDraftChange: (value: string) => {
      setRoomWidthDraft(value)
      queueRoomDimensionCommit(value, widthDebounceRef, onWidthChange)
    },
    onRoomHeightDraftChange: (value: string) => {
      setRoomHeightDraft(value)
      queueRoomDimensionCommit(value, heightDebounceRef, onHeightChange)
    },
    onRoomWidthFocus: () => setIsWidthEditing(true),
    onRoomHeightFocus: () => setIsHeightEditing(true),
    onRoomWidthBlur: () => {
      if (!selectedBubble) return
      commitRoomDimension({
        draftValue: roomWidthDraft,
        fallbackValueMm: selectedBubble.widthMm,
        timerRef: widthDebounceRef,
        onCommit: onWidthCommit ?? onWidthChange,
        setDraft: setRoomWidthDraft,
        setEditing: setIsWidthEditing,
      })
    },
    onRoomHeightBlur: () => {
      if (!selectedBubble) return
      commitRoomDimension({
        draftValue: roomHeightDraft,
        fallbackValueMm: selectedBubble.heightMm,
        timerRef: heightDebounceRef,
        onCommit: onHeightCommit ?? onHeightChange,
        setDraft: setRoomHeightDraft,
        setEditing: setIsHeightEditing,
      })
    },
    onWallThicknessDraftChange: (value: string) => {
      setWallThicknessDraft(value)
      queueWallDimensionCommit(value, wallThicknessDebounceRef, onWallThicknessChange)
    },
    onWallHeightDraftChange: (value: string) => {
      setWallHeightDraft(value)
      queueWallDimensionCommit(value, wallHeightDebounceRef, onWallHeightChange)
    },
    onWallThicknessFocus: () => setIsWallThicknessEditing(true),
    onWallHeightFocus: () => setIsWallHeightEditing(true),
    onWallThicknessBlur: () => {
      if (!selectedWall || !onWallThicknessChange) return
      clearDebounceTimer(wallThicknessDebounceRef)
      const parsed = Number(wallThicknessDraft)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setWallThicknessDraft(String(selectedWall.thickness))
        return
      }
      onWallThicknessChange(selectedWall.id, parsed)
      setIsWallThicknessEditing(false)
    },
    onWallHeightBlur: () => {
      if (!selectedWall || !onWallHeightChange) return
      clearDebounceTimer(wallHeightDebounceRef)
      const parsed = Number(wallHeightDraft)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setWallHeightDraft(String(selectedWall.heightMm))
        return
      }
      onWallHeightChange(selectedWall.id, parsed)
      setIsWallHeightEditing(false)
    },
    onOpeningWidthDraftChange: (value: string) => {
      setOpeningWidthDraft(value)
      queueOpeningDimensionCommit(value, openingHeightDraft, openingWidthDebounceRef)
    },
    onOpeningHeightDraftChange: (value: string) => {
      setOpeningHeightDraft(value)
      queueOpeningDimensionCommit(openingWidthDraft, value, openingHeightDebounceRef)
    },
    onWindowSillHeightDraftChange: (value: string) => {
      setWindowSillHeightDraft(value)
      queueWindowSillHeightCommit(value)
    },
    onOpeningWidthFocus: () => setIsOpeningWidthEditing(true),
    onOpeningHeightFocus: () => setIsOpeningHeightEditing(true),
    onWindowSillHeightFocus: () => setIsWindowSillHeightEditing(true),
    onOpeningWidthBlur: () => {
      if (!selectedOpening) return
      commitOpeningDimension({
        widthValue: openingWidthDraft,
        heightValue: openingHeightDraft,
        fallbackWidthMm: selectedOpening.widthMm,
        fallbackHeightMm: selectedOpening.heightMm,
        timerRef: openingWidthDebounceRef,
        setWidthDraft: setOpeningWidthDraft,
        setHeightDraft: setOpeningHeightDraft,
      })
      setIsOpeningWidthEditing(false)
    },
    onOpeningHeightBlur: () => {
      if (!selectedOpening) return
      commitOpeningDimension({
        widthValue: openingWidthDraft,
        heightValue: openingHeightDraft,
        fallbackWidthMm: selectedOpening.widthMm,
        fallbackHeightMm: selectedOpening.heightMm,
        timerRef: openingHeightDebounceRef,
        setWidthDraft: setOpeningWidthDraft,
        setHeightDraft: setOpeningHeightDraft,
      })
      setIsOpeningHeightEditing(false)
    },
    onWindowSillHeightBlur: () => {
      commitWindowSillHeight()
      setIsWindowSillHeightEditing(false)
    },
  }
}
