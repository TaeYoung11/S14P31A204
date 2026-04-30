import { useEffect, useRef, useState } from 'react'
import type { Address } from 'react-daum-postcode'
import { useRegisterProjectSite } from '@/features/project/hooks/useProjects'

type KakaoLatLng = object
interface KakaoMap {
  setCenter: (latLng: KakaoLatLng) => void
}
interface KakaoMarker {
  setMap: (map: KakaoMap | null) => void
  setPosition: (latLng: KakaoLatLng) => void
}
interface KakaoAddressResult {
  address_name: string
  x: string
  y: string
}
interface KakaoMaps {
  load: (callback: () => void) => void
  LatLng: new (lat: number, lng: number) => KakaoLatLng
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap
  Marker: new (options: { position: KakaoLatLng }) => KakaoMarker
  services: {
    Status: { OK: string }
    Geocoder: new () => {
      addressSearch: (
        address: string,
        callback: (result: KakaoAddressResult[], status: string) => void,
      ) => void
    }
  }
}
type KakaoWindow = Window & { kakao?: { maps?: KakaoMaps } }

/** window.kakao.maps 인스턴스를 안전하게 반환 */
const getKakaoMaps = (): KakaoMaps | undefined => {
  if (typeof window === 'undefined') return undefined
  return (window as KakaoWindow).kakao?.maps
}

const KAKAO_SCRIPT_ID = 'kakao-map-sdk'

/**
 * 카카오맵 SDK를 동적으로 로드하는 유틸 함수
 * - 이미 스크립트가 로드된 경우 중복 삽입 없이 기존 스크립트를 재사용
 * - API 키가 없으면 즉시 reject
 */
const loadKakaoMapSdk = () =>
  new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('브라우저 환경에서만 지도를 불러올 수 있습니다.'))
      return
    }

    const kakaoApiKey = import.meta.env.VITE_KAKAO_MAP_API_KEY
    if (!kakaoApiKey) {
      reject(new Error('VITE_KAKAO_MAP_API_KEY 환경변수가 필요합니다.'))
      return
    }

    const boot = () => {
      const maps = getKakaoMaps()
      if (!maps) {
        reject(new Error('카카오맵 SDK를 불러오지 못했습니다.'))
        return
      }

      maps.load(() => resolve())
    }

    const existingScript = document.getElementById(KAKAO_SCRIPT_ID) as HTMLScriptElement | null
    if (existingScript) {
      if (getKakaoMaps()) {
        boot()
      } else {
        existingScript.addEventListener('load', boot, { once: true })
        existingScript.addEventListener('error', () => reject(new Error('카카오맵 SDK 로드에 실패했습니다.')), { once: true })
      }
      return
    }

    const script = document.createElement('script')
    script.id = KAKAO_SCRIPT_ID
    script.async = true
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoApiKey}&libraries=services&autoload=false`
    script.addEventListener('load', boot, { once: true })
    script.addEventListener('error', () => reject(new Error('카카오맵 SDK 로드에 실패했습니다.')), { once: true })
    document.head.appendChild(script)
  })

interface UseProjectSiteModalParams {
  isOpen: boolean
  projectId: string | null
  onClose: () => void
}

export const useProjectSiteModal = ({
  isOpen,
  projectId,
  onClose,
}: UseProjectSiteModalParams) => {
  const registerSite = useRegisterProjectSite()
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<KakaoMap | null>(null)
  const markerRef = useRef<KakaoMarker | null>(null)

  const [sdkError, setSdkError] = useState('')
  const [showPostcode, setShowPostcode] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState('')
  const [searchError, setSearchError] = useState('')
  const [polygonCoords, setPolygonCoords] = useState<number[][] | null>(null)

  useEffect(() => {
    if (!isOpen) return

    loadKakaoMapSdk()
      .then(() => {
        const maps = getKakaoMaps()
        if (!mapContainerRef.current || !maps) return

        const center = new maps.LatLng(37.5665, 126.978)
        mapRef.current = new maps.Map(mapContainerRef.current, {
          center,
          level: 3,
        })
      })
      .catch((error: Error) => {
        setSdkError(error.message)
      })
  }, [isOpen])

  const resetRegisterSite = registerSite.reset

  /** 모달이 닫힐 때 모든 로컬 상태를 초기화 */
  useEffect(() => {
    if (isOpen) return
    const timeout = window.setTimeout(() => {
      setShowPostcode(false)
      setSelectedAddress('')
      setSearchError('')
      setSdkError('')
      setPolygonCoords(null)
      resetRegisterSite()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [isOpen, resetRegisterSite])

  /** 지도 중심 이동 및 마커 위치 업데이트 */
  const updateMap = (lat: number, lng: number) => {
    const maps = getKakaoMaps()
    const map = mapRef.current
    if (!maps || !map) return

    const position = new maps.LatLng(lat, lng)
    map.setCenter(position)

    if (!markerRef.current) {
      const marker = new maps.Marker({ position })
      marker.setMap(map)
      markerRef.current = marker
      return
    }

    markerRef.current.setPosition(position)
  }

  /**
   * 주소 검색 완료 핸들러
   * - 좌표 변환 → 지도 이동 → 대지 등록 API 호출 → 폴리곤 좌표 저장
   */
  const handleAddressSelect = (data: Address) => {
    setShowPostcode(false)
    setSearchError('')

    if (!projectId) {
      setSearchError('프로젝트 정보를 찾을 수 없습니다.')
      return
    }

    const maps = getKakaoMaps()
    if (!maps?.services) {
      setSearchError('카카오맵 서비스를 불러오지 못했습니다.')
      return
    }

    const geocoder = new maps.services.Geocoder()
    geocoder.addressSearch(data.address, async (result, status) => {
      if (status !== maps.services.Status.OK || result.length === 0) {
        setSearchError('주소 좌표를 가져오지 못했습니다.')
        return
      }

      const { x, y } = result[0]
      const latitude = Number(y)
      const longitude = Number(x)

      setSelectedAddress(data.address)
      updateMap(latitude, longitude)

      try {
        const siteResult = await registerSite.mutateAsync({ projectId, latitude, longitude })
        const outerRing = siteResult.cadastralInfo?.polygon?.coordinates?.[0]?.[0]
        if (outerRing && outerRing.length > 0) {
          setPolygonCoords(outerRing)
        } else {
          onClose()
        }
      } catch {
        setSearchError('대지 정보 저장에 실패했습니다. 다시 시도해주세요.')
      }
    })
  }

  return {
    mapContainerRef,
    showPostcode,
    setShowPostcode,
    selectedAddress,
    polygonCoords,
    sdkError,
    searchError,
    registerError: registerSite.error,
    isRegistering: registerSite.isPending,
    handleAddressSelect,
  }
}
