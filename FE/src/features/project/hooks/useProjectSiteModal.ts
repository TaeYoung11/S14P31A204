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

interface KakaoMapsApi {
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

type KakaoWindow = Window & {
  kakao?: {
    maps?: KakaoMapsApi
  }
}

const KAKAO_SCRIPT_ID = 'kakao-map-sdk'

function getKakaoMaps(): KakaoMapsApi | undefined {
  return (window as KakaoWindow).kakao?.maps
}

const loadKakaoMapSdk = () =>
  new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('브라우저 환경에서만 지도를 사용할 수 있습니다.'))
      return
    }

    const kakaoApiKey = import.meta.env.VITE_KAKAO_MAP_API_KEY
    if (!kakaoApiKey) {
      reject(new Error('VITE_KAKAO_MAP_API_KEY 환경 변수가 없습니다.'))
      return
    }

    const boot = () => {
      const kakaoMaps = getKakaoMaps()
      if (!kakaoMaps) {
        reject(new Error('카카오 지도 SDK를 불러오지 못했습니다.'))
        return
      }

      kakaoMaps.load(() => resolve())
    }

    const existingScript = document.getElementById(KAKAO_SCRIPT_ID) as HTMLScriptElement | null
    if (existingScript) {
      if (getKakaoMaps()) {
        boot()
      } else {
        existingScript.addEventListener('load', boot, { once: true })
        existingScript.addEventListener(
          'error',
          () => reject(new Error('카카오 지도 SDK 로드에 실패했습니다.')),
          { once: true },
        )
      }
      return
    }

    const script = document.createElement('script')
    script.id = KAKAO_SCRIPT_ID
    script.async = true
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoApiKey}&libraries=services&autoload=false`
    script.addEventListener('load', boot, { once: true })
    script.addEventListener(
      'error',
      () => reject(new Error('카카오 지도 SDK 로드에 실패했습니다.')),
      { once: true },
    )
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
        const kakaoMaps = getKakaoMaps()
        if (!mapContainerRef.current || !kakaoMaps) return

        const center = new kakaoMaps.LatLng(37.5665, 126.978)
        mapRef.current = new kakaoMaps.Map(mapContainerRef.current, {
          center,
          level: 3,
        })
      })
      .catch((error: Error) => {
        setSdkError(error.message)
      })
  }, [isOpen])

  const resetRegisterSite = registerSite.reset

  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowPostcode(false)
      setSelectedAddress('')
      setSearchError('')
      setSdkError('')
      setPolygonCoords(null)
      resetRegisterSite()
    }
  }, [isOpen, resetRegisterSite])

  const updateMap = (lat: number, lng: number) => {
    const kakaoMaps = getKakaoMaps()
    if (!kakaoMaps || !mapRef.current) return

    const position = new kakaoMaps.LatLng(lat, lng)
    mapRef.current.setCenter(position)

    if (!markerRef.current) {
      const marker = new kakaoMaps.Marker({ position })
      marker.setMap(mapRef.current)
      markerRef.current = marker
      return
    }

    markerRef.current.setPosition(position)
  }

  const handleAddressSelect = (data: Address) => {
    setShowPostcode(false)
    setSearchError('')

    if (!projectId) {
      setSearchError('프로젝트 ID를 찾을 수 없습니다.')
      return
    }

    const kakaoMaps = getKakaoMaps()
    if (!kakaoMaps?.services) {
      setSearchError('카카오 지도 서비스를 불러오지 못했습니다.')
      return
    }

    const geocoder = new kakaoMaps.services.Geocoder()
    geocoder.addressSearch(
      data.address,
      async (result: KakaoAddressResult[], status: string) => {
        if (status !== kakaoMaps.services.Status.OK || result.length === 0) {
          setSearchError('주소를 좌표로 변환하지 못했습니다.')
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
          setSearchError('부지 정보를 저장하지 못했습니다. 다시 시도해 주세요.')
        }
      },
    )
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
