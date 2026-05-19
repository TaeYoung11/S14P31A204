import aboutHtml from './assets/About.html?raw'
import StaticHtmlFrame from '@/shared/components/StaticHtmlFrame'

/** 서비스 소개 정적 HTML을 /about 라우트에 표시하는 페이지. */
export default function AboutPage() {
  return (
    <StaticHtmlFrame
      title="BATANG about"
      sourceHtml={aboutHtml}
    />
  )
}
