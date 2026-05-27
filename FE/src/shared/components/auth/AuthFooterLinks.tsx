import { Link } from 'react-router-dom'

interface AuthFooterLinksProps {
  fitViewport: boolean
}

/**
 * 인증 화면 하단의 보조 링크 모음.
 * 로그인/회원가입 양쪽에서 같은 링크 구성을 유지하기 위해 별도 컴포넌트로 분리했다.
 */
export default function AuthFooterLinks({ fitViewport }: AuthFooterLinksProps) {
  return (
    <div
      className={`auth-footer-links shrink-0 text-center text-[11px] leading-5 text-[#9ca3af] ${
        fitViewport ? 'mt-2 pb-6' : 'pt-4 pb-6'
      }`}
    >
      <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <Link to="/about" className="hover:text-[#374151]">
          서비스 소개
        </Link>
        <span className="text-[#d1d5db]">|</span>
        <span className="cursor-pointer hover:text-[#374151]">개인정보처리방침</span>
        <span className="text-[#d1d5db]">|</span>
        <span className="cursor-pointer hover:text-[#374151]">고객지원</span>
      </span>
    </div>
  )
}
