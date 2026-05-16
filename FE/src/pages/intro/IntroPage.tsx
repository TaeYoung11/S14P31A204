// Intro.html 기반의 서비스 첫 진입 페이지를 앱 루트에 표시합니다.
import { useMemo } from 'react'
import introHtml from './assets/Intro.html?raw'

const buildIntroHtml = () =>
  introHtml
    .replace('</style>', 'header.nav{display:none!important}</style>')
    .replace(/href="Intro\.html"/g, 'href="/" target="_top"')
    .replace(/href="About\.html"/g, 'href="/about" target="_top"')
    .replace(/href="Login\.html"/g, 'href="/login" target="_top"')
    .replace(/href="Register\.html"/g, 'href="/register" target="_top"')
    .replace(/href="favicon\.svg"/g, 'href="/favicon.svg"')
    .replace(/src="logo\.svg"/g, 'src="/logo.svg"')
    .replace(
      'document.getElementById(\'go-login\').click()',
      'window.top.location.href = \'/login\'',
    )

export default function IntroPage() {
  const introSource = useMemo(() => buildIntroHtml(), [])

  return (
    <iframe
      title="BATANG intro"
      srcDoc={introSource}
      sandbox="allow-scripts allow-top-navigation-by-user-activation"
      className="block h-screen w-screen border-0"
    />
  )
}
