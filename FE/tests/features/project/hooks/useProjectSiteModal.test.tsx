/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Address } from 'react-daum-postcode'
import { useProjectSiteModal } from '@/features/project/hooks/useProjectSiteModal'
import { useProjectSitePolygon, useRegisterProjectSite } from '@/features/project/hooks/useProjects'
import { getKakaoMaps, loadKakaoMapSdk } from '@/features/project/utils/kakaoMapSdk'
import { saveProjectSitePolygon } from '@/features/project/utils/projectSiteCache'

vi.mock('@/features/project/hooks/useProjects', () => ({
  useProjectSitePolygon: vi.fn(),
  useRegisterProjectSite: vi.fn(),
}))

vi.mock('@/features/project/utils/kakaoMapSdk', () => ({
  getKakaoMaps: vi.fn(),
  loadKakaoMapSdk: vi.fn(),
}))

vi.mock('@/features/project/utils/projectSiteCache', () => ({
  saveProjectSitePolygon: vi.fn(),
}))

interface HarnessProps {
  isOpen: boolean
  projectId: string | null
  isInteractionLocked?: boolean
  onHandleAddressSelectReady: (handler: (data: Address) => void) => void
}

interface GeocoderResult {
  x: string
  y: string
}

type GeocoderStatus = string
type AddressSearchCallback = (result: GeocoderResult[], status: GeocoderStatus) => void | Promise<void>

function Harness({
  isOpen,
  projectId,
  isInteractionLocked = false,
  onHandleAddressSelectReady,
}: HarnessProps) {
  const { handleAddressSelect } = useProjectSiteModal({ isOpen, projectId, isInteractionLocked })

  useEffect(() => {
    onHandleAddressSelectReady(handleAddressSelect)
  }, [handleAddressSelect, onHandleAddressSelectReady])

  return null
}

describe('useProjectSiteModal', () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironmentFlag: unknown
  let capturedAddressSearchCallbacks: AddressSearchCallback[]
  let latestHandleAddressSelect: ((data: Address) => void) | null
  let mutateAsync: ReturnType<typeof vi.fn>
  let reset: ReturnType<typeof vi.fn>

  beforeEach(() => {
    previousActEnvironmentFlag = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    capturedAddressSearchCallbacks = []
    latestHandleAddressSelect = null

    mutateAsync = vi.fn().mockResolvedValue({
      cadastralInfo: {
        polygon: {
          coordinates: [[[
            [127.0, 37.0],
            [127.1, 37.0],
            [127.1, 37.1],
            [127.0, 37.1],
            [127.0, 37.0],
          ]]],
        },
      },
    })
    reset = vi.fn()

    vi.mocked(useProjectSitePolygon).mockReturnValue({
      data: { polygonRing: null, source: 'none' },
    } as ReturnType<typeof useProjectSitePolygon>)

    vi.mocked(useRegisterProjectSite).mockReturnValue({
      mutateAsync,
      reset,
      error: null,
      isPending: false,
    } as ReturnType<typeof useRegisterProjectSite>)

    vi.mocked(loadKakaoMapSdk).mockResolvedValue(undefined)
    vi.mocked(getKakaoMaps).mockReturnValue({
      LatLng: vi.fn().mockImplementation((lat: number, lng: number) => ({ lat, lng })),
      Map: vi.fn().mockImplementation(() => ({ setCenter: vi.fn() })),
      Marker: vi.fn().mockImplementation(() => ({ setMap: vi.fn(), setPosition: vi.fn() })),
      services: {
        Geocoder: vi.fn().mockImplementation(() => ({
          addressSearch: (_address: string, cb: AddressSearchCallback) => {
            capturedAddressSearchCallbacks.push(cb)
          },
        })),
        Status: {
          OK: 'OK',
        },
      },
    } as ReturnType<typeof getKakaoMaps>)

  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    latestHandleAddressSelect = null
    vi.clearAllMocks()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironmentFlag
  })

  it('모달이 닫힌 뒤 지연된 주소 검색 콜백은 대지 등록 API를 호출하지 않는다', async () => {
    act(() => {
      root.render(
        <Harness
          isOpen
          projectId="project-1"
          onHandleAddressSelectReady={(handler) => {
            latestHandleAddressSelect = handler
          }}
        />,
      )
    })

    act(() => {
      latestHandleAddressSelect?.({
        address: '서울특별시 강남구',
      } as Address)
    })

    expect(capturedAddressSearchCallbacks).toHaveLength(1)

    act(() => {
      root.render(
        <Harness
          isOpen={false}
          projectId="project-1"
          onHandleAddressSelectReady={(handler) => {
            latestHandleAddressSelect = handler
          }}
        />,
      )
    })

    await act(async () => {
      await capturedAddressSearchCallbacks[0]?.([{ x: '127.02', y: '37.50' }], 'OK')
    })

    expect(mutateAsync).not.toHaveBeenCalled()
    expect(saveProjectSitePolygon).not.toHaveBeenCalled()
  })

  it('모달이 열린 세션의 주소 검색 콜백은 대지 등록 API를 호출한다', async () => {
    act(() => {
      root.render(
        <Harness
          isOpen
          projectId="project-1"
          onHandleAddressSelectReady={(handler) => {
            latestHandleAddressSelect = handler
          }}
        />,
      )
    })

    act(() => {
      latestHandleAddressSelect?.({
        address: '서울특별시 강남구',
      } as Address)
    })

    await act(async () => {
      await capturedAddressSearchCallbacks[0]?.([{ x: '127.02', y: '37.50' }], 'OK')
    })

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(saveProjectSitePolygon).toHaveBeenCalledTimes(1)
  })

  it('같은 모달 세션에서 주소를 연속 선택하면 마지막 선택 요청만 처리한다', async () => {
    act(() => {
      root.render(
        <Harness
          isOpen
          projectId="project-1"
          onHandleAddressSelectReady={(handler) => {
            latestHandleAddressSelect = handler
          }}
        />,
      )
    })

    act(() => {
      latestHandleAddressSelect?.({
        address: '서울특별시 강남구 1',
      } as Address)
      latestHandleAddressSelect?.({
        address: '서울특별시 강남구 2',
      } as Address)
    })

    expect(capturedAddressSearchCallbacks).toHaveLength(2)

    // 두 번째 선택이 먼저 완료되는 상황
    await act(async () => {
      await capturedAddressSearchCallbacks[1]?.([{ x: '127.11', y: '37.61' }], 'OK')
    })
    // 첫 번째 선택 콜백이 늦게 도착해도 최신 요청이 아니므로 무시되어야 한다.
    await act(async () => {
      await capturedAddressSearchCallbacks[0]?.([{ x: '127.01', y: '37.51' }], 'OK')
    })

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync).toHaveBeenCalledWith({
      projectId: 'project-1',
      latitude: 37.61,
      longitude: 127.11,
    })
  })
})
