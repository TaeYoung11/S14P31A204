import { Client } from '@stomp/stompjs'
import { useAuthStore } from '@/shared/stores/authStore'
import { getRuntimeEnvString } from '@/shared/lib/runtimeEnv'

export let stompClient: Client | null = null

const DEFAULT_API_BASE_URL = '/api/v1'
const STOMP_ENDPOINT_PATH = '/ws-ifc'
const STOMP_SOCKET_OPEN = 1
const STOMP_CONNECT_TIMEOUT_MS = 5000

let stompConnectPromise: Promise<void> | null = null

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
  const client = new Client({
    brokerURL: resolveStompBrokerUrlFromApi(),
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

  if (client.connected && client.webSocket?.readyState !== STOMP_SOCKET_OPEN) {
    client.forceDisconnect()
  }

  if (!client.active) {
    client.activate()
  }

  stompConnectPromise ??= waitForStompConnection(client).finally(() => {
    stompConnectPromise = null
  })
  await stompConnectPromise

  return client
}
