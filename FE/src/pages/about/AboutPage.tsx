// About.html 기반의 비즈니스 소개 페이지를 앱 라우트에 표시합니다.
import { useMemo } from 'react'
import aboutHtml from './assets/About.html?raw'

const buildAboutHtml = () =>
  aboutHtml
    .replace('</style>', 'header.nav{display:none!important}</style>')
    .replace(/href="Intro\.html"/g, 'href="/" target="_top"')
    .replace(/href="About\.html"/g, 'href="/about" target="_top"')
    .replace(/href="Login\.html"/g, 'href="/login" target="_top"')
    .replace(/href="Register\.html"/g, 'href="/register" target="_top"')
    .replace(/href="favicon\.svg"/g, 'href="/favicon.svg"')
    .replace(/src="logo\.svg"/g, 'src="/logo.svg"')

export default function AboutPage() {
  const aboutSource = useMemo(() => buildAboutHtml(), [])

  return (
    <iframe
      title="BATANG about"
      srcDoc={aboutSource}
      sandbox="allow-scripts allow-top-navigation-by-user-activation"
      className="block h-screen w-screen border-0"
    />
  )
}
