interface StaticHtmlRouteOptions {
  shouldHideStaticHeader?: boolean
  shouldRewriteLoginButtonScript?: boolean
}

const STATIC_ROUTE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/href="Intro\.html"/g, 'href="/" target="_top"'],
  [/href="About\.html"/g, 'href="/about" target="_top"'],
  [/href="Login\.html"/g, 'href="/login" target="_top"'],
  [/href="Register\.html"/g, 'href="/register" target="_top"'],
  [/href="favicon\.svg"/g, 'href="/favicon.svg"'],
  [/src="logo\.svg"/g, 'src="/logo.svg"'],
]

const HIDDEN_STATIC_HEADER_STYLE = 'header.nav{display:none!important}'

const LOGIN_BUTTON_SCRIPT = 'document.getElementById(\'go-login\').click()'
const ROUTER_LOGIN_SCRIPT = 'window.top.location.href = \'/login\''

const appendStyleBeforeClosingTag = (html: string, style: string) => {
  if (!html.includes('</style>')) {
    return html
  }

  return html.replace('</style>', `${style}</style>`)
}

/**
 * 기존 정적 HTML 산출물을 앱 iframe에서 재사용하기 위한 순수 변환 함수.
 * 원본 파일은 그대로 두고 iframe 렌더링 시점에 라우팅/공용 자원 경로만 앱 기준으로 맞춘다.
 */
export const buildStaticHtmlSource = (
  html: string,
  {
    shouldHideStaticHeader = true,
    shouldRewriteLoginButtonScript = false,
  }: StaticHtmlRouteOptions = {},
) => {
  const source = shouldHideStaticHeader
    ? appendStyleBeforeClosingTag(html, HIDDEN_STATIC_HEADER_STYLE)
    : html

  const routedSource = STATIC_ROUTE_REPLACEMENTS.reduce(
    (currentSource, [pattern, replacement]) => currentSource.replace(pattern, replacement),
    source,
  )

  if (!shouldRewriteLoginButtonScript) {
    return routedSource
  }

  return routedSource.replace(LOGIN_BUTTON_SCRIPT, ROUTER_LOGIN_SCRIPT)
}
