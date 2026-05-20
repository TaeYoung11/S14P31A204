import type { Client, IMessage, StompSubscription } from '@stomp/stompjs'
import { ensureStompConnected, hasStompAccessToken } from '@/shared/lib/stomp'

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

interface SharedTopicSubscription {
  subscription: StompSubscription | null
  listeners: Set<(message: IMessage) => void>
}

const sharedTopicSubscriptionsByClient = new WeakMap<Client, Map<string, SharedTopicSubscription>>()

const getSharedTopicSubscriptions = (client: Client): Map<string, SharedTopicSubscription> => {
  let subscriptions = sharedTopicSubscriptionsByClient.get(client)
  if (!subscriptions) {
    subscriptions = new Map<string, SharedTopicSubscription>()
    sharedTopicSubscriptionsByClient.set(client, subscriptions)
  }
  return subscriptions
}

const detachSharedTopicListener = (
  subscriptions: Map<string, SharedTopicSubscription>,
  destination: string,
  listener: (message: IMessage) => void,
) => {
  const sharedSubscription = subscriptions.get(destination)
  if (!sharedSubscription) return

  sharedSubscription.listeners.delete(listener)
  if (sharedSubscription.listeners.size > 0) return

  sharedSubscription.subscription?.unsubscribe()
  subscriptions.delete(destination)
}

export const subscribeStompTopicsWithPolling = ({
  client,
  topics,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: SubscribeStompTopicsWithPollingParams): (() => void) => {
  let isDisposed = false
  let connectPollTimer: number | null = null

  if (!hasStompAccessToken()) {
    return () => {
      isDisposed = true
    }
  }

  const sharedSubscriptions = getSharedTopicSubscriptions(client)
  const attachedTopics = topics.map((topic) => {
    let sharedSubscription = sharedSubscriptions.get(topic.destination)
    if (!sharedSubscription) {
      sharedSubscription = {
        subscription: null,
        listeners: new Set<(message: IMessage) => void>(),
      }
      sharedSubscriptions.set(topic.destination, sharedSubscription)
    }
    sharedSubscription.listeners.add(topic.onMessage)
    return {
      ...topic,
      sharedSubscription,
    }
  })

  const clearConnectPollTimer = () => {
    if (connectPollTimer === null) return
    window.clearInterval(connectPollTimer)
    connectPollTimer = null
  }

  const allSubscribed = () =>
    attachedTopics.every((topic) => topic.sharedSubscription.subscription !== null)

  const subscribeIfConnected = () => {
    if (isDisposed || !client.connected) return

    attachedTopics.forEach((topic) => {
      if (topic.sharedSubscription.subscription) return

      topic.sharedSubscription.subscription = client.subscribe(topic.destination, (message) => {
        Array.from(topic.sharedSubscription.listeners).forEach((listener) => {
          try {
            listener(message)
          } catch (error) {
            console.error('[stomp-subscription] listener failed', {
              destination: topic.destination,
              error,
            })
          }
        })
      })
    })

    if (allSubscribed()) clearConnectPollTimer()
  }

  void ensureStompConnected()
    .then((connectedClient) => {
      if (connectedClient !== client) return
      subscribeIfConnected()
    })
    .catch(() => undefined)

  subscribeIfConnected()

  if (!allSubscribed()) {
    connectPollTimer = window.setInterval(() => {
      subscribeIfConnected()
    }, pollIntervalMs)
  }

  return () => {
    isDisposed = true
    attachedTopics.forEach((topic) => {
      detachSharedTopicListener(sharedSubscriptions, topic.destination, topic.onMessage)
    })
    clearConnectPollTimer()
  }
}
