import { Client } from '@stomp/stompjs'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws'

export let stompClient: Client | null = null

export const createStompClient = (): Client => {
  const client = new Client({
    brokerURL: WS_URL,
    reconnectDelay: 3000,
    onConnect: () => {
      console.log('[STOMP] Connected')
    },
    onDisconnect: () => {
      console.log('[STOMP] Disconnected')
    },
    onStompError: (frame) => {
      console.error('[STOMP] Error:', frame)
    },
    // SockJS fallback (필요 시 주석 해제):
    // webSocketFactory: () => new SockJS('http://localhost:8000/stomp'),
  })

  stompClient = client
  return client
}

export const getStompClient = (): Client => {
  if (!stompClient) {
    return createStompClient()
  }
  return stompClient
}
