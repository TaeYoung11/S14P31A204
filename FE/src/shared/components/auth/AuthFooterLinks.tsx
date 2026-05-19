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
      className={`shrink-0 truncate text-center text-[11px] text-[#9ca3af] ${
        fitViewport ? 'mt-8 pb-8' : 'pt-2'
      }`}
    >
      <span className="inline-flex items-center justify-center gap-3">
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
