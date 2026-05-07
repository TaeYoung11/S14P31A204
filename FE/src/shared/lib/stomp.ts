import { Client } from '@stomp/stompjs'
import { useAuthStore } from '@/shared/stores/authStore'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'
const STOMP_ENDPOINT_PATH = '/ws-ifc'

const toWebSocketUrl = (apiBaseUrl: string): string => {
  const apiUrl = new URL(apiBaseUrl, window.location.origin)
  const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  const basePath = apiUrl.pathname.replace(/\/api(?:\/v\d+)?\/?$/, '')

  return `${protocol}//${apiUrl.host}${basePath}${STOMP_ENDPOINT_PATH}`
}

const WS_URL = toWebSocketUrl(API_BASE_URL)

export let stompClient: Client | null = null

const getConnectHeaders = (): Record<string, string> => {
  const token = useAuthStore.getState().token
  if (!token) {
    console.warn('[STOMP] Missing auth token for CONNECT')
    return {}
  }
  return { Authorization: `Bearer ${token}` }
}

export const createStompClient = (): Client => {
  const client = new Client({
    brokerURL: WS_URL,
    connectHeaders: getConnectHeaders(),
    beforeConnect: () => {
      client.connectHeaders = getConnectHeaders()
      console.log('[STOMP] Connecting', { brokerURL: WS_URL, hasAuthorization: Boolean(client.connectHeaders.Authorization) })
    },
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

export const ensureStompConnected = async (): Promise<Client> => {
  const client = getStompClient()
  if (client.connected) {
    console.log('[STOMP] Already connected')
    return client
  }

  if (!client.active) {
    console.log('[STOMP] Activating client')
    client.activate()
  }

  await new Promise<void>((resolve, reject) => {
    let intervalId = 0
    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId)
      console.error('[STOMP] Connection timed out')
      reject(new Error('STOMP client connection timed out.'))
    }, 5000)

    intervalId = window.setInterval(() => {
      if (!client.connected) return
      window.clearTimeout(timeoutId)
      window.clearInterval(intervalId)
      resolve()
    }, 50)
  })

  return client
}
