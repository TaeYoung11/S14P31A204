type KakaoLatLng = object

export interface KakaoMap {
  setCenter: (latLng: KakaoLatLng) => void
}

export interface KakaoMarker {
  setMap: (map: KakaoMap | null) => void
  setPosition: (latLng: KakaoLatLng) => void
}

interface KakaoAddressResult {
  address_name: string
  x: string
  y: string
}

export interface KakaoMaps {
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

const KAKAO_SCRIPT_ID = 'kakao-map-sdk'

/** window.kakao.maps 인스턴스를 안전하게 반환한다. */
export function getKakaoMaps(): KakaoMaps | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as KakaoWindow).kakao?.maps
}

/**
 * 카카오맵 SDK를 동적으로 로드한다.
 * - 기존 스크립트가 있으면 재사용
 * - 환경변수 키 누락 시 즉시 실패
 */
export function loadKakaoMapSdk(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
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
        existingScript.addEventListener('error', () => reject(new Error('카카오맵 SDK 로드에 실패했습니다.')), {
          once: true,
        })
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
}
