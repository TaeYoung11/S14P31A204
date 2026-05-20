import introHtml from './assets/Intro.html?raw'
import aboutHtml from '../about/assets/About.html?raw'
import StaticHtmlFrame from '@/shared/components/StaticHtmlFrame'

/** 메인 랜딩 정적 HTML을 앱 루트 라우트에 표시하는 페이지. */
export default function IntroPage() {
  return (
    <main className="min-h-screen bg-[#f8fafc]">
      <StaticHtmlFrame
        title="BATANG intro"
        sourceHtml={introHtml}
        shouldRewriteLoginButtonScript
        injectedStyle=".ctas{display:none!important}.hero p.lead{margin-bottom:0!important}"
      />
      <section id="service-intro" aria-label="BATANG service introduction">
        <StaticHtmlFrame
          title="BATANG service introduction"
          sourceHtml={aboutHtml}
          className="block h-[3600px] w-screen border-0 md:h-[3200px] lg:h-[3000px]"
        />
      </section>
    </main>
  )
}
