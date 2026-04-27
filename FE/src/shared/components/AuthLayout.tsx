import authHero from '@/assets/auth-hero.png'

interface AuthLayoutProps {
  children: React.ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen overflow-hidden bg-white">
      <div className="auth-panel-left">
        <div className="auth-logo-text">BATANG</div>

        <div className="flex flex-1 flex-col justify-center">
          <h1 className="auth-hero-title">
            건축의 복잡함을
            <br />
            구조적으로 정리합니다.
          </h1>
          <p className="auth-hero-desc">
            BATANG은 설계자와 클라이언트를 위한 BIM 협업 워크스페이스입니다.
            <br />
            설계 검토부터 의사소통까지, 모든 흐름을 한 화면에서 관리해보세요.
          </p>

          <div className="auth-hero-img-wrapper">
            <img src={authHero} alt="BATANG 인증 화면" className="h-auto w-full object-cover" />
          </div>
        </div>

        <div className="mt-6 flex shrink-0 items-end justify-between">
          <div className="flex items-center gap-4">
            <span className="auth-keyword">PRECISION</span>
            <span className="auth-keyword">CLARITY</span>
            <span className="auth-keyword">STRUCTURE</span>
          </div>
          <span className="auth-watermark">Batang</span>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 py-4 lg:px-8 lg:py-6">
        <div className="w-full max-w-[400px]">
          {children}

          <div className="mt-5 flex items-center justify-center gap-3 text-[11px] text-[#9ca3af]">
            <span className="cursor-pointer hover:text-[#6b7280]">이용약관</span>
            <span>|</span>
            <span className="cursor-pointer hover:text-[#6b7280]">개인정보처리방침</span>
            <span>|</span>
            <span className="cursor-pointer hover:text-[#6b7280]">고객지원</span>
          </div>
        </div>
      </div>
    </div>
  )
}
