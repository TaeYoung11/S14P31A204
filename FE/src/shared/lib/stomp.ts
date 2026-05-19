import { Client } from '@stomp/stompjs'
import { useAuthStore } from '@/shared/stores/authStore'
import { getRuntimeEnvString } from '@/shared/lib/runtimeEnv'

const DEFAULT_API_BASE_URL = '/api/v1'
const STOMP_ENDPOINT_PATH = '/ws-ifc'
const STOMP_SOCKET_OPEN = 1
const STOMP_CONNECT_TIMEOUT_MS = 5000
const STOMP_GLOBAL_STATE_KEY = '__batangStompClientState__'

interface StompClientGlobalState {
  client: Client | null
  connectPromise: Promise<void> | null
}

const getStompGlobalState = (): StompClientGlobalState => {
  const scope = globalThis as typeof globalThis & Record<string, StompClientGlobalState | undefined>
  scope[STOMP_GLOBAL_STATE_KEY] ??= {
    client: null,
    connectPromise: null,
  }
  return scope[STOMP_GLOBAL_STATE_KEY]
}

const stompGlobalState = getStompGlobalState()

export let stompClient: Client | null = stompGlobalState.client

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

const resolveStompBrokerUrlFromApi = (path = STOMP_ENDPOINT_PATH): string => {
  if (typeof window === 'undefined') return `ws://localhost:8080${path}`

  const apiBaseUrl = getRuntimeEnvString('VITE_API_URL', DEFAULT_API_BASE_URL)

  try {
    const apiUrl = new URL(apiBaseUrl, window.location.origin)
    const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    const basePath = apiUrl.pathname.replace(/\/api(?:\/v\d+)?\/?$/, '')
    return `${wsProtocol}//${apiUrl.host}${basePath}${path}`
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
  if (stompGlobalState.client) {
    stompClient = stompGlobalState.client
    return stompGlobalState.client
  }

  const client = new Client({
    brokerURL: resolveStompBrokerUrlFromApi(),
    reconnectDelay: 3000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
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
    onWebSocketClose: (event) => {
      console.log('[STOMP] WS closed', { code: event?.code, reason: event?.reason, wasClean: event?.wasClean })
    },
    onWebSocketError: (event) => {
      console.warn('[STOMP] WS error', event)
    },
    onStompError: (frame) => {
      console.error('[STOMP] Error:', frame)
    },
  })

  stompGlobalState.client = client
  stompClient = client
  return client
}

/** 단일 STOMP 클라이언트 인스턴스를 반환한다. */
export const getStompClient = (): Client => {
  if (!stompGlobalState.client) {
    return createStompClient()
  }
  stompClient = stompGlobalState.client
  return stompGlobalState.client
}

const isStompSocketOpen = (client: Client): boolean =>
  client.connected && client.webSocket?.readyState === STOMP_SOCKET_OPEN

const waitForStompConnection = (client: Client): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    let intervalId = 0
    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId)
      reject(new Error('STOMP client connection timed out.'))
    }, STOMP_CONNECT_TIMEOUT_MS)

    intervalId = window.setInterval(() => {
      if (!isStompSocketOpen(client)) return
      window.clearTimeout(timeoutId)
      window.clearInterval(intervalId)
      resolve()
    }, 50)
  })

export const ensureStompConnected = async (): Promise<Client> => {
  const client = getStompClient()
  if (isStompSocketOpen(client)) return client

  // 끊긴 상태에서 명시적으로 forceDisconnect를 호출하면 stomp.js 내부의
  // 자동 재연결 흐름과 경합해 매 publish마다 새 WebSocket이 열리는 증상이 있었다.
  // reconnectDelay에 의한 자동 재연결을 신뢰하고, 아직 활성화 전이라면 activate만 호출한다.
  if (!client.active) {
    client.activate()
  }

  stompGlobalState.connectPromise ??= waitForStompConnection(client).finally(() => {
    stompGlobalState.connectPromise = null
  })
  await stompGlobalState.connectPromise

  return client
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const client = stompGlobalState.client
    stompGlobalState.client = null
    stompGlobalState.connectPromise = null
    stompClient = null
    if (client?.active || client?.connected) {
      void client.deactivate()
    }
  })
}
