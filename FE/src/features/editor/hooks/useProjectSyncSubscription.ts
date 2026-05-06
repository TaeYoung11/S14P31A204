import { useEffect } from 'react'
import type { IMessage } from '@stomp/stompjs'
import { getStompClient } from '@/shared/lib/stomp'
import { subscribeStompTopicsWithPolling } from '../utils/stompSubscription'
import {
  PROJECT_SYNC_TOPIC_PREFIX,
  extractIfcStorageUrl,
  parseProjectSyncMessage,
} from '../utils/workspaceSyncMessage'

interface UseProjectSyncSubscriptionParams {
  projectId: string | undefined
  onOutputIfcStorageUrl: (ifcStorageUrl: string) => Promise<void> | void
}

export function useProjectSyncSubscription({
  projectId,
  onOutputIfcStorageUrl,
}: UseProjectSyncSubscriptionParams) {
  /** 프로젝트 sync 토픽에서 IFC 결과 URL만 구독한다. */
  useEffect(() => {
    if (!projectId) return

    const client = getStompClient()
    const topic = `${PROJECT_SYNC_TOPIC_PREFIX}/${projectId}/sync`

    const handleMessage = (message: IMessage) => {
      const parsed = parseProjectSyncMessage(message)
      if (!parsed) return
      const ifcStorageUrl = extractIfcStorageUrl(parsed)
      if (!ifcStorageUrl) return
      void onOutputIfcStorageUrl(ifcStorageUrl)
    }

    return subscribeStompTopicsWithPolling({
      client,
      topics: [{ destination: topic, onMessage: handleMessage }],
    })
  }, [onOutputIfcStorageUrl, projectId])
}
