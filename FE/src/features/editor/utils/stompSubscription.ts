import type { Client, IMessage, StompSubscription } from '@stomp/stompjs'
import { hasStompAccessToken } from '@/shared/lib/stomp'

export interface StompTopicSubscription {
  destination: string
  onMessage: (message: IMessage) => void
}

export interface SubscribeStompTopicsWithPollingParams {
  client: Client
  topics: StompTopicSubscription[]
  pollIntervalMs?: number
}

const DEFAULT_POLL_INTERVAL_MS = 200

/**
 * STOMP 클라이언트 활성화 및 연결 지연 상황을 고려해 토픽 구독을 시도한다.
 * - 연결 전에는 polling으로 재시도한다.
 * - cleanup 시 구독과 타이머를 함께 해제한다.
 */
export const subscribeStompTopicsWithPolling = ({
  client,
  topics,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: SubscribeStompTopicsWithPollingParams): (() => void) => {
  let isDisposed = false
  const subscriptions: Array<StompSubscription | null> = topics.map(() => null)
  let connectPollTimer: number | null = null

  const subscribeIfConnected = () => {
    if (isDisposed || !client.connected) return

    topics.forEach((topic, index) => {
      if (subscriptions[index]) return
      subscriptions[index] = client.subscribe(topic.destination, topic.onMessage)
    })
  }

  if (!client.active) {
    if (!hasStompAccessToken()) {
      return () => {
        isDisposed = true
      }
    }
    client.activate()
  }

  subscribeIfConnected()

  if (subscriptions.some((subscription) => !subscription)) {
    connectPollTimer = window.setInterval(() => {
      subscribeIfConnected()

      const allSubscribed = subscriptions.every((subscription) => !!subscription)
      if (allSubscribed && connectPollTimer !== null) {
        window.clearInterval(connectPollTimer)
        connectPollTimer = null
      }
    }, pollIntervalMs)
  }

  return () => {
    isDisposed = true
    subscriptions.forEach((subscription) => subscription?.unsubscribe())
    if (connectPollTimer !== null) {
      window.clearInterval(connectPollTimer)
    }
  }
}
