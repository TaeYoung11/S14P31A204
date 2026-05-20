import introHtml from './assets/Intro.html?raw'
import StaticHtmlFrame from '@/shared/components/StaticHtmlFrame'

/** 메인 랜딩 정적 HTML을 앱 루트 라우트에 표시하는 페이지. */
export default function IntroPage() {
  return (
    <StaticHtmlFrame
      title="BATANG intro"
      sourceHtml={introHtml}
      shouldRewriteLoginButtonScript
    />
  )
}
