import { useCallback, useRef, useState } from 'react'
import { getRuntimeEnvBoolean } from '@/shared/lib/runtimeEnv'
import { normalizeIfcSourceName, resolveIfcFetchUrl } from '../utils/ifcSource'

export type IfcLoadState = 'idle' | 'loading' | 'ready' | 'error'

export interface IfcContext {
  sourceUrl: string
  sourceName: string
  modelId: number | null
  byteLength: number
  loadedAt: string
  [key: string]: unknown
}

interface WebIfcApiLike {
  SetWasmPath?: (path: string) => void
  Init: () => Promise<void>
  OpenModel: (modelData: Uint8Array) => number
  CloseModel?: (modelId: number) => void
  Dispose?: () => void
}

interface WebIfcNamespace {
  IfcAPI: new () => WebIfcApiLike
}

interface RuntimeFragmentsManagerLike {
  dispose?: () => void
}

interface RuntimeIfcLoaderLike {
  load: (ifcArray: Uint8Array, ifcBuffer?: ArrayBuffer) => Promise<void> | void
}

declare global {
  interface Window {
    WebIFC?: WebIfcNamespace
    fragmentsManager?: RuntimeFragmentsManagerLike
    ifcLoader?: RuntimeIfcLoaderLike
    batangFragmentsManager?: RuntimeFragmentsManagerLike
    batangIfcLoader?: RuntimeIfcLoaderLike
  }
}

export interface UseIfcLoadingLayerParams {
  importFloorProjectFromIfc: (ifcText: string, sourceName: string) => Promise<void>
  importFloorProjectFromWebIfc?: (ifcApi: unknown, modelId: number, sourceName: string) => Promise<boolean>
  loadFragments?: IfcFragmentsLoader
  extractIfcContext?: (ifcApi: WebIfcApiLike, modelId: number, sourceUrl: string) => Promise<Partial<IfcContext> | null> | Partial<IfcContext> | null
}

export type IfcFragmentsLoader = (ifcArray: Uint8Array, ifcBuffer: ArrayBuffer) => Promise<void> | void

export interface LoadIfcFromStorageUrlOptions {
  sourceName?: string
  webIfcWasmPath?: string
}

const decoder = new TextDecoder('utf-8')
const IFC_URL_DEBUG = getRuntimeEnvBoolean('VITE_IFC_URL_DEBUG')

const resolveRuntimeFragmentsLoader = (): IfcFragmentsLoader | null => {
  if (typeof window === 'undefined') return null

  const manager = window.batangFragmentsManager ?? window.fragmentsManager
  const loader = window.batangIfcLoader ?? window.ifcLoader

  if (!loader || typeof loader.load !== 'function') return null

  return async (ifcArray: Uint8Array, ifcBuffer: ArrayBuffer) => {
    manager?.dispose?.()
    await loader.load(ifcArray, ifcBuffer)
  }
}

export function useIfcLoadingLayer({
  importFloorProjectFromIfc,
  importFloorProjectFromWebIfc,
  loadFragments,
  extractIfcContext,
}: UseIfcLoadingLayerParams) {
  const [ifcLoadState, setIfcLoadState] = useState<IfcLoadState>('idle')
  const [ifcLoadError, setIfcLoadError] = useState<string | null>(null)
  const [lastIfcContext, setLastIfcContext] = useState<IfcContext | null>(null)
  const loadSeqRef = useRef(0)
  const dynamicFragmentsLoaderRef = useRef<IfcFragmentsLoader | null>(null)

  const setIfcFragmentsLoader = useCallback((loader: IfcFragmentsLoader | null) => {
    dynamicFragmentsLoaderRef.current = loader
  }, [])

  /**
   * 저장소 URL의 IFC를 읽어 2D/3D 데이터 계층에 순차 반영한다.
   * - web-ifc 파싱 성공 시 2D 직접 추출 결과를 우선 사용한다.
   * - 실패 또는 미지원 시 STEP 파서 기반 폴백을 적용한다.
   */
  const loadIfcFromStorageUrl = useCallback(async (
    ifcStorageUrl: string,
    options?: LoadIfcFromStorageUrlOptions,
  ) => {
    const sourceUrl = ifcStorageUrl.trim()
    if (!sourceUrl) return
    const fetchUrl = resolveIfcFetchUrl(sourceUrl)
    if (IFC_URL_DEBUG && typeof window !== 'undefined') {
      window.localStorage.setItem('ifc-last-fetch-url', fetchUrl)
      console.info('[ifc-url][resolved]', { sourceUrl, fetchUrl })
    }

    const currentLoadSeq = loadSeqRef.current + 1
    loadSeqRef.current = currentLoadSeq

    setIfcLoadState('loading')
    setIfcLoadError(null)

    try {
      const ifcResponse = await fetch(fetchUrl)
      if (!ifcResponse.ok) {
        throw new Error(`IFC fetch 실패 (${ifcResponse.status})`)
      }
      const ifcBuffer = await ifcResponse.arrayBuffer()
      const ifcArray = new Uint8Array(ifcBuffer)
      const ifcText = decoder.decode(ifcBuffer)
      const sourceName = options?.sourceName ?? normalizeIfcSourceName(sourceUrl)

      const contextBase: IfcContext = {
        sourceUrl,
        sourceName,
        modelId: null,
        byteLength: ifcBuffer.byteLength,
        loadedAt: new Date().toISOString(),
      }
      let webIfcParseCompleted = false
      const parsedContext = await (async (): Promise<Partial<IfcContext> | null> => {
        const webIfc = window.WebIFC
        if (!webIfc?.IfcAPI) return null

        const ifcApi = new webIfc.IfcAPI()
        let modelId: number | null = null
        try {
          if (options?.webIfcWasmPath) {
            ifcApi.SetWasmPath?.(options.webIfcWasmPath)
          }
          await ifcApi.Init()
          modelId = ifcApi.OpenModel(ifcArray)

          if (importFloorProjectFromWebIfc) {
            webIfcParseCompleted = await importFloorProjectFromWebIfc(ifcApi, modelId, sourceName)
          }

          const extracted = extractIfcContext
            ? await extractIfcContext(ifcApi, modelId, sourceUrl)
            : null
          return {
            modelId,
            ...(extracted ?? {}),
          }
        } finally {
          if (modelId !== null) {
            ifcApi.CloseModel?.(modelId)
          }
          ifcApi.Dispose?.()
        }
      })()
      const fragmentsLoader =
        loadFragments
        ?? dynamicFragmentsLoaderRef.current
        ?? resolveRuntimeFragmentsLoader()

      // 2D 업데이트 후 3D 업데이트 순으로 처리한다. (동일 IFC 버퍼 재사용)
      // 2D는 web-ifc 직접 추출을 우선 시도하고, 실패하면 STEP 파서로 폴백한다.
      if (!webIfcParseCompleted) {
        await importFloorProjectFromIfc(ifcText, sourceName)
      }
      if (fragmentsLoader) {
        await fragmentsLoader(ifcArray, ifcBuffer)
      }

      if (loadSeqRef.current !== currentLoadSeq) return

      setLastIfcContext({
        ...contextBase,
        ...(parsedContext ?? {}),
      })
      setIfcLoadState('ready')
    } catch (error: unknown) {
      if (loadSeqRef.current !== currentLoadSeq) return

      const message = error instanceof Error ? error.message : 'IFC 로딩 중 알 수 없는 오류가 발생했습니다.'
      setIfcLoadError(message)
      setIfcLoadState('error')
      throw error
    }
  }, [extractIfcContext, importFloorProjectFromIfc, importFloorProjectFromWebIfc, loadFragments])

  return {
    ifcLoadState,
    ifcLoadError,
    lastIfcContext,
    loadIFC: loadIfcFromStorageUrl,
    loadIfcFromStorageUrl,
    setIfcFragmentsLoader,
  }
}
