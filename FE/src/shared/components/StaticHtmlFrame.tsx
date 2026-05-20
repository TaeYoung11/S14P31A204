import { useMemo } from 'react'
import { buildStaticHtmlSource } from '@/shared/utils/staticHtml'

interface StaticHtmlFrameProps {
  /** iframe 접근성 제목. 라우트별 화면 이름을 그대로 넘긴다. */
  title: string
  /** Vite raw import로 읽은 정적 HTML 원문. */
  sourceHtml: string
  /** Intro.html의 버튼 스크립트를 React Router 이동으로 바꿔야 하는 경우에만 켠다. */
  shouldRewriteLoginButtonScript?: boolean
  injectedStyle?: string
  className?: string
}

/**
 * 정적 HTML 랜딩 산출물을 React Router 화면 안에 안전하게 표시하는 공용 iframe.
 * 페이지 컴포넌트는 HTML 원본과 제목만 넘기고, 경로 보정은 이 컴포넌트에 위임한다.
 */
export default function StaticHtmlFrame({
  title,
  sourceHtml,
  shouldRewriteLoginButtonScript = false,
  injectedStyle,
  className = 'block h-screen w-screen border-0',
}: StaticHtmlFrameProps) {
  const htmlSource = useMemo(
    () => buildStaticHtmlSource(sourceHtml, { shouldRewriteLoginButtonScript, injectedStyle }),
    [sourceHtml, shouldRewriteLoginButtonScript, injectedStyle],
  )

  return (
    <iframe
      title={title}
      srcDoc={htmlSource}
      sandbox="allow-scripts allow-top-navigation-by-user-activation"
      className={className}
    />
  )
}
