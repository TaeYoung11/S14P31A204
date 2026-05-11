// 에디터 도구 선택 상태와 버블 연결 시작점을 관리하는 훅입니다.
import { useCallback, useState } from 'react'

interface UseEditorToolStateParams {
  isBubbleReadOnly: boolean
}

export function useEditorToolState({ isBubbleReadOnly }: UseEditorToolStateParams) {
  const [selectedTool, setSelectedTool] = useState<string>('selection')
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null)

  const resetToolSelection = useCallback(() => {
    setSelectedTool('selection')
    setConnectingFromId(null)
  }, [])

  const handleSetSelectedTool = useCallback((tool: string) => {
    if (isBubbleReadOnly && (tool === 'connect' || tool === 'delete')) {
      resetToolSelection()
      return
    }

    setSelectedTool(tool)
    if (tool !== 'connect') setConnectingFromId(null)
  }, [isBubbleReadOnly, resetToolSelection])

  return {
    selectedTool,
    setSelectedTool,
    connectingFromId,
    setConnectingFromId,
    resetToolSelection,
    handleSetSelectedTool,
  }
}
