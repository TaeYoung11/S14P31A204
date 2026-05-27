import { useEffect, useRef, useState } from 'react'
import introHtml from './assets/Intro.html?raw'
import aboutHtml from '../about/assets/About.html?raw'
import StaticHtmlFrame from '@/shared/components/StaticHtmlFrame'

const INTRO_INJECTED_STYLE = `
  :root {
    --accent: #3B45B3 !important;
    --accent-2: #2D3691 !important;
    --accent-soft: rgba(59, 69, 179, 0.12) !important;
    --accent-glow: rgba(59, 69, 179, 0.28) !important;
  }

  html,
  body,
  body * {
    user-select: none !important;
    -webkit-user-select: none !important;
  }

  img,
  canvas {
    -webkit-user-drag: none !important;
  }

  #scene-canvas {
    pointer-events: none !important;
    cursor: default !important;
  }

  body.interactive #scene-canvas,
  body.interactive #scene-canvas:active {
    cursor: default !important;
  }

  body {
    background:
      radial-gradient(900px 520px at 72% 18%, rgba(59, 69, 179, 0.18), transparent 65%),
      linear-gradient(135deg, #f0f2f9 0%, #eef0ff 48%, #f0f2f9 100%) !important;
  }

  .veil {
    background:
      linear-gradient(90deg, rgba(240, 242, 249, 0.99) 0%, rgba(240, 242, 249, 0.95) 31%, rgba(240, 242, 249, 0.72) 39%, rgba(240, 242, 249, 0.18) 54%, rgba(240, 242, 249, 0.02) 70%),
      radial-gradient(900px 600px at 81% 44%, rgba(59, 69, 179, 0.12), transparent 74%),
      radial-gradient(620px 520px at 42% 52%, rgba(255, 255, 255, 0.88), transparent 72%) !important;
  }

  .motion-layer::before {
    background: conic-gradient(from 120deg, rgba(59, 69, 179, 0.7), rgba(45, 54, 145, 0.55), rgba(238, 240, 255, 0.42), rgba(59, 69, 179, 0.7)) !important;
  }

  .motion-layer::after {
    background: conic-gradient(from 20deg, rgba(59, 69, 179, 0.44), rgba(45, 54, 145, 0.24), rgba(59, 69, 179, 0.38), rgba(59, 69, 179, 0.44)) !important;
  }

  .beam-layer {
    background:
      linear-gradient(116deg, transparent 0 45%, rgba(255,255,255,.58) 49%, transparent 53% 100%),
      linear-gradient(72deg, transparent 0 62%, rgba(59,69,179,.09) 66%, transparent 70% 100%) !important;
  }

  .scanline-layer {
    background: linear-gradient(180deg, transparent, rgba(59,69,179,.08), transparent) !important;
  }

  .nav-cta,
  .btn-primary {
    background: linear-gradient(135deg, var(--accent), var(--accent-2)) !important;
    box-shadow: 0 18px 40px rgba(59, 69, 179, 0.26) !important;
  }

  .nav-cta:hover,
  .btn-primary:hover {
    background: linear-gradient(135deg, var(--accent), var(--accent-2)) !important;
    box-shadow: 0 22px 52px rgba(59, 69, 179, 0.34) !important;
  }

  h1.title .accent {
    background: linear-gradient(110deg, var(--accent) 0%, var(--accent-2) 46%, #5962c8 72%, var(--accent) 100%) !important;
    -webkit-background-clip: text !important;
    background-clip: text !important;
    color: transparent !important;
    text-shadow: 0 0 34px rgba(59, 69, 179, 0.18) !important;
  }

  .watermark {
    background: linear-gradient(90deg, rgba(59, 69, 179, 0.1), rgba(45, 54, 145, 0.08)) !important;
    -webkit-background-clip: text !important;
    background-clip: text !important;
    color: transparent !important;
  }

  .workflow-pills {
    width: min(520px, 100%) !important;
    gap: 10px !important;
    margin: 0 0 28px !important;
  }

  .workflow-pills span {
    min-height: 42px !important;
    min-width: 86px !important;
    padding: 0 18px !important;
    font-size: 15px !important;
    font-weight: 800 !important;
  }

  .workflow-pills span:hover {
    color: var(--accent) !important;
  }

  .workflow-pills span.active {
    background: rgba(59, 69, 179, 0.12) !important;
    color: var(--accent) !important;
    box-shadow: inset 0 0 0 1px rgba(59, 69, 179, 0.18) !important;
  }

  .ctas {
    display: none !important;
  }

  .hero p.lead {
    margin-bottom: 0 !important;
  }

  @media (max-width: 640px) {
    .workflow-pills {
      width: min(390px, 100%) !important;
      gap: 7px !important;
      margin: -4px 0 24px !important;
    }

    .workflow-pills span {
      min-height: 38px !important;
      min-width: 0 !important;
      padding: 0 12px !important;
      font-size: 14px !important;
    }
  }
`

const ABOUT_INJECTED_STYLE = `
  :root {
    --accent: #3B45B3 !important;
    --accent-2: #2D3691 !important;
    --accent-soft: rgba(59, 69, 179, 0.1) !important;
    --accent-glow: rgba(59, 69, 179, 0.28) !important;
  }

  html,
  body,
  body * {
    user-select: none !important;
    -webkit-user-select: none !important;
  }

  img,
  canvas {
    -webkit-user-drag: none !important;
  }

  body {
    background:
      radial-gradient(980px 640px at 86% 8%, rgba(59, 69, 179, 0.18), transparent 62%),
      radial-gradient(760px 500px at 8% 38%, rgba(45, 54, 145, 0.1), transparent 68%),
      linear-gradient(180deg, #f0f2f9 0%, #eef0ff 52%, #f0f2f9 100%) !important;
  }

  body::after {
    background:
      linear-gradient(120deg, rgba(255, 255, 255, 0.72), transparent 42%),
      radial-gradient(44% 42% at 82% 18%, rgba(59, 69, 179, 0.14), transparent 70%) !important;
  }

  body::before {
    background-image:
      linear-gradient(to right, rgba(59, 69, 179, 0.055) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(59, 69, 179, 0.045) 1px, transparent 1px) !important;
  }

  .about-ambient::before {
    background: conic-gradient(from 140deg, rgba(59,69,179,.72), rgba(45,54,145,.56), rgba(238,240,255,.34), rgba(59,69,179,.72)) !important;
  }

  .about-ambient::after {
    background: conic-gradient(from 30deg, rgba(59,69,179,.42), rgba(45,54,145,.34), rgba(238,240,255,.24), rgba(59,69,179,.42)) !important;
  }

  .about-beam {
    background:
      linear-gradient(112deg, transparent 0 38%, rgba(255,255,255,.58) 42%, transparent 47%),
      linear-gradient(68deg, transparent 0 58%, rgba(59,69,179,.1) 62%, transparent 68%) !important;
  }

  .eyebrow,
  .hero-side,
  .cta-block {
    border-color: rgba(59, 69, 179, 0.18) !important;
  }

  h1.title .accent,
  .section-head .num,
  .mcard .badge,
  .value h3 em {
    background: linear-gradient(120deg, var(--accent), var(--accent-2)) !important;
    -webkit-background-clip: text !important;
    background-clip: text !important;
    color: transparent !important;
  }

  .hero-side::before {
    background: linear-gradient(135deg, rgba(59, 69, 179, 0.18), rgba(45, 54, 145, 0.1), transparent 55%) !important;
  }

  .about-visual {
    background:
      linear-gradient(135deg, rgba(255,255,255,.82), rgba(255,255,255,.42)),
      radial-gradient(circle at 70% 20%, rgba(59,69,179,.18), transparent 48%) !important;
  }

  .about-visual::before {
    background:
      linear-gradient(to right, rgba(59,69,179,.14) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(59,69,179,.14) 1px, transparent 1px) !important;
  }

  .plan-line {
    border-color: rgba(59,69,179,.5) !important;
    box-shadow: 0 0 34px rgba(59,69,179,.12) !important;
  }

  .plan-line.two {
    border-color: rgba(45,54,145,.56) !important;
  }

  .plan-line.three {
    border-color: rgba(89,98,200,.52) !important;
  }

  .visual-chip.b {
    background: rgba(59,69,179,.9) !important;
  }

  .about-process {
    background:
      linear-gradient(145deg, rgba(255, 255, 255, .9), rgba(255, 255, 255, .58)),
      radial-gradient(circle at 78% 8%, rgba(59, 69, 179, .18), transparent 44%) !important;
    box-shadow:
      0 34px 110px rgba(59, 69, 179, .18),
      inset 0 1px 0 rgba(255, 255, 255, .92) !important;
  }

  .about-process-card:hover {
    border-color: rgba(59, 69, 179, .2) !important;
    box-shadow: 0 24px 70px rgba(59, 69, 179, .16) !important;
  }

  .section-head {
    border-bottom-color: rgba(59, 69, 179, .14) !important;
  }

  .mcard::before {
    color: rgba(59, 69, 179, .1) !important;
  }

  .mcard::after,
  .member::before {
    background:
      radial-gradient(circle at 35% 30%, rgba(255, 255, 255, .82), transparent 34%),
      linear-gradient(135deg, rgba(59, 69, 179, .92), rgba(45, 54, 145, .72)) !important;
    box-shadow: 0 16px 34px rgba(59, 69, 179, .24) !important;
  }

  .member .name .num {
    color: #3B45B3 !important;
  }

  .tag.t-AI {
    background: var(--accent-soft) !important;
    color: var(--accent) !important;
    border-color: rgba(59,69,179,0.18) !important;
  }

  .cta-block {
    background:
      linear-gradient(135deg, rgba(255, 255, 255, .86), rgba(238, 240, 255, .72)),
      radial-gradient(circle at 86% 20%, rgba(59, 69, 179, .18), transparent 44%) !important;
    box-shadow:
      0 24px 76px rgba(59, 69, 179, .14),
      inset 0 1px 0 rgba(255, 255, 255, .88) !important;
  }

  .cta-block::before {
    background: linear-gradient(90deg, transparent, rgba(59, 69, 179, .16), transparent) !important;
  }

  .cta-block .btn-primary,
  .btn-primary,
  .nav-cta {
    background: linear-gradient(135deg, var(--accent), var(--accent-2)) !important;
    color: white !important;
    box-shadow: 0 16px 36px rgba(59, 69, 179, .24) !important;
  }

  .cta-block .btn-primary:hover,
  .btn-primary:hover,
  .nav-cta:hover {
    background: linear-gradient(135deg, var(--accent), var(--accent-2)) !important;
  }

  footer.foot {
    border-top-color: rgba(59, 69, 179, .12) !important;
  }
`

export default function IntroPage() {
  const introFrameRef = useRef<HTMLIFrameElement | null>(null)
  const introSectionRef = useRef<HTMLDivElement | null>(null)
  const aboutSectionRef = useRef<HTMLElement | null>(null)
  const [shouldMountAbout, setShouldMountAbout] = useState(false)

  useEffect(() => {
    const introSection = introSectionRef.current
    if (!introSection) return

    const setIntroPaused = (paused: boolean) => {
      introFrameRef.current?.contentWindow?.postMessage({ type: '__batang_intro_animation', paused }, '*')
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIntroPaused(!entry.isIntersecting || document.hidden)
      },
      { threshold: 0.08 },
    )

    observer.observe(introSection)

    const handleVisibilityChange = () => {
      const rect = introSection.getBoundingClientRect()
      const isInViewport = rect.bottom > 0 && rect.top < window.innerHeight
      setIntroPaused(document.hidden || !isInViewport)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      setIntroPaused(true)
    }
  }, [])

  useEffect(() => {
    const aboutSection = aboutSectionRef.current
    if (!aboutSection || shouldMountAbout) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setShouldMountAbout(true)
        observer.disconnect()
      },
      { rootMargin: '240px 0px' },
    )

    observer.observe(aboutSection)

    return () => observer.disconnect()
  }, [shouldMountAbout])

  return (
    <main className="min-h-screen select-none bg-[var(--color-bg)]">
      <div ref={introSectionRef}>
        <StaticHtmlFrame
          ref={introFrameRef}
          title="BATANG intro"
          sourceHtml={introHtml}
          shouldRewriteLoginButtonScript
          injectedStyle={INTRO_INJECTED_STYLE}
          className="block h-screen w-screen select-none border-0"
        />
      </div>
      <section
        ref={aboutSectionRef}
        id="service-intro"
        className="min-h-[3600px] md:min-h-[3200px] lg:min-h-[3000px]"
        aria-label="BATANG service introduction"
      >
        {shouldMountAbout && (
          <StaticHtmlFrame
            title="BATANG service introduction"
            sourceHtml={aboutHtml}
            injectedStyle={ABOUT_INJECTED_STYLE}
            className="block h-[3600px] w-screen select-none border-0 md:h-[3200px] lg:h-[3000px]"
          />
        )}
      </section>
    </main>
  )
}
