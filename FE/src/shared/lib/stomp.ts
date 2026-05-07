import { Client } from '@stomp/stompjs'
import { useAuthStore } from '@/shared/stores/authStore'
import { getRuntimeEnvString } from '@/shared/lib/runtimeEnv'

export let stompClient: Client | null = null

const DEFAULT_API_BASE_URL = '/api/v1'

interface StoredAuthState {
  state?: {
    token?: string | null
  }
}

const readPersistedAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem('bim-storage')
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredAuthState
    return parsed?.state?.token ?? null
  } catch {
    return null
  }
}

const resolveAccessToken = (): string | null => {
  return useAuthStore.getState().token ?? readPersistedAccessToken()
}

const resolveStompBrokerUrlFromApi = (path = '/ws-ifc'): string => {
  if (typeof window === 'undefined') return 'ws://localhost:8080/ws-ifc'

  const apiBaseUrl = getRuntimeEnvString('VITE_API_URL', DEFAULT_API_BASE_URL)

  try {
    const apiUrl = new URL(apiBaseUrl, window.location.origin)
    const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${wsProtocol}//${apiUrl.host}${path}`
  } catch {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${wsProtocol}//${window.location.host}${path}`
  }
}

export const hasStompAccessToken = (): boolean => {
  return !!resolveAccessToken()
}

/** 앱 전역에서 공유하는 STOMP 클라이언트를 생성한다. */
export const createStompClient = (): Client => {
  const client = new Client({
    brokerURL: resolveStompBrokerUrlFromApi('/ws-ifc'),
    reconnectDelay: 3000,
    beforeConnect: async () => {
      const accessToken = resolveAccessToken()
      if (!accessToken) {
        throw new Error('STOMP connect skipped: access token is missing.')
      }

      client.connectHeaders = {
        Authorization: `Bearer ${accessToken}`,
      }
    },
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

/** 단일 STOMP 클라이언트 인스턴스를 반환한다. */
export const getStompClient = (): Client => {
  if (!stompClient) {
    return createStompClient()
  }
  return stompClient
}
