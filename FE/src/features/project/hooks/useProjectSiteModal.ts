import { useEffect, useMemo, useRef, useState } from 'react'
import type { Address } from 'react-daum-postcode'
import { useProjectSitePolygon, useRegisterProjectSite } from '@/features/project/hooks/useProjects'
import { saveProjectSitePolygon } from '@/features/project/utils/projectSiteCache'
import {
  getKakaoMaps,
  loadKakaoMapSdk,
  type KakaoMap,
  type KakaoMarker,
} from '@/features/project/utils/kakaoMapSdk'
import { extractOuterRingFromCoordinates } from '@/features/project/utils/sitePolygon'
import { calculateSiteAreaM2, toPyeong } from '@/features/project/utils/siteGeometry'

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
  const sitePolygonQuery = useProjectSitePolygon(projectId, isOpen)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<KakaoMap | null>(null)
  const markerRef = useRef<KakaoMarker | null>(null)

  const [sdkError, setSdkError] = useState('')
  const [showPostcode, setShowPostcode] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState('')
  const [searchError, setSearchError] = useState('')
  const [polygonCoords, setPolygonCoords] = useState<number[][] | null>(null)
  const cachedPolygonCoords = sitePolygonQuery.data?.polygonRing ?? null
  const effectivePolygonCoords = polygonCoords ?? cachedPolygonCoords

  const siteAreaM2 = useMemo(
    () => (effectivePolygonCoords ? calculateSiteAreaM2(effectivePolygonCoords) : null),
    [effectivePolygonCoords],
  )
  const siteAreaPyeong = useMemo(
    () => (siteAreaM2 ? toPyeong(siteAreaM2) : null),
    [siteAreaM2],
  )

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
        const outerRing = extractOuterRingFromCoordinates(siteResult.cadastralInfo?.polygon?.coordinates)
        if (outerRing) {
          saveProjectSitePolygon(projectId, outerRing)
          setPolygonCoords(outerRing)
          onClose()
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
    polygonCoords: effectivePolygonCoords,
    siteAreaM2,
    siteAreaPyeong,
    sdkError,
    searchError,
    registerError: registerSite.error,
    isRegistering: registerSite.isPending,
    handleAddressSelect,
  }
}
