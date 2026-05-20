import logoSrc from '@/assets/logo.svg'

interface BrandLogoProps {
  inverted?: boolean
  logoClassName?: string
  textClassName?: string
}

/** BATANG 브랜드 로고와 워드마크를 한곳에서 관리한다. */
export default function BrandLogo({
  inverted = false,
  logoClassName = 'h-[24px] w-auto drop-shadow-sm',
  textClassName = 'text-[13px]',
}: BrandLogoProps) {
  return (
    <>
      <img
        src={logoSrc}
        alt="바탕 : BATANG"
        className={`${logoClassName} ${inverted ? 'brightness-0 invert opacity-80' : ''}`}
      />
      <span
        className={`font-mono font-semibold tracking-[0.18em] ${
          inverted ? 'text-white' : 'text-slate-900'
        } ${textClassName}`}
      >
        BATANG
      </span>
    </>
  )
}
