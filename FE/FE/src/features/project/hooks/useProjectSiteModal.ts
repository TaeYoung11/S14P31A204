import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRegisterProjectSite } from '@/features/project/hooks/useProjects'

declare global {
  interface Window {
    kakao?: {
      maps: {
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
    }
  }
}

interface KakaoLatLng {}
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

const KAKAO_SCRIPT_ID = 'kakao-map-sdk'

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
      if (!window.kakao?.maps) {
        reject(new Error('카카오맵 SDK를 불러오지 못했습니다.'))
        return
      }

      window.kakao.maps.load(() => resolve())
    }

    const existingScript = document.getElementById(KAKAO_SCRIPT_ID) as HTMLScriptElement | null
    if (existingScript) {
      if (window.kakao?.maps) {
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
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoApiKey}&libraries=services&autoload=false`
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
  const navigate = useNavigate()
  const registerSite = useRegisterProjectSite()
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<KakaoMap | null>(null)
  const markerRef = useRef<KakaoMarker | null>(null)

  const [sdkError, setSdkError] = useState('')
  const [address, setAddress] = useState('')
  const [selectedAddress, setSelectedAddress] = useState('')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [searchError, setSearchError] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    loadKakaoMapSdk()
      .then(() => {
        if (!mapContainerRef.current || !window.kakao?.maps) return

        const center = new window.kakao.maps.LatLng(37.5665, 126.978)
        mapRef.current = new window.kakao.maps.Map(mapContainerRef.current, {
          center,
          level: 3,
        })
      })
      .catch((error: Error) => {
        setSdkError(error.message)
      })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      setAddress('')
      setSelectedAddress('')
      setLatitude(null)
      setLongitude(null)
      setSearchError('')
      setSdkError('')
      registerSite.reset()
    }
  }, [isOpen, registerSite])

  const updateMap = (lat: number, lng: number) => {
    if (!window.kakao?.maps || !mapRef.current) return

    const position = new window.kakao.maps.LatLng(lat, lng)
    mapRef.current.setCenter(position)

    if (!markerRef.current) {
      markerRef.current = new window.kakao.maps.Marker({ position })
      markerRef.current.setMap(mapRef.current)
      return
    }

    markerRef.current.setPosition(position)
  }

  const handleSearchAddress = () => {
    setSearchError('')
    setSdkError('')

    if (!address.trim()) {
      setSearchError('검색할 주소를 입력해주세요.')
      return
    }

    if (!window.kakao?.maps?.services) {
      setSearchError('카카오맵 서비스를 아직 불러오지 못했습니다.')
      return
    }

    setIsSearching(true)

    const geocoder = new window.kakao.maps.services.Geocoder()
    geocoder.addressSearch(address, (result, status) => {
      setIsSearching(false)

      if (status !== window.kakao?.maps.services.Status.OK || result.length === 0) {
        setSearchError('주소 검색 결과를 찾지 못했습니다.')
        return
      }

      const firstResult = result[0]
      const nextLatitude = Number(firstResult.y)
      const nextLongitude = Number(firstResult.x)

      setSelectedAddress(firstResult.address_name)
      setLatitude(nextLatitude)
      setLongitude(nextLongitude)
      updateMap(nextLatitude, nextLongitude)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSearchError('')

    if (!projectId) {
      setSearchError('프로젝트 정보를 찾을 수 없습니다.')
      return
    }

    if (latitude === null || longitude === null) {
      setSearchError('먼저 주소를 검색해서 위치를 선택해주세요.')
      return
    }

    await registerSite.mutateAsync({
      projectId,
      latitude,
      longitude,
    })

    onClose()
    navigate(`/projects/${projectId}/editor`)
  }

  return {
    mapContainerRef,
    address,
    selectedAddress,
    latitude,
    longitude,
    sdkError,
    searchError,
    submitError: registerSite.error,
    isSearching,
    isSubmitting: registerSite.isPending,
    setAddress,
    handleSearchAddress,
    handleSubmit,
  }
}
