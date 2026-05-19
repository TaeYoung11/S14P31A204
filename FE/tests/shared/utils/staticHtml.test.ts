import { describe, expect, it } from 'vitest'
import { buildStaticHtmlSource } from '@/shared/utils/staticHtml'

describe('buildStaticHtmlSource', () => {
  it('adds the hidden header rule to an existing style tag', () => {
    const html = '<html><head><style>body{margin:0}</style></head><body><header class="nav"></header></body></html>'

    expect(buildStaticHtmlSource(html)).toContain('body{margin:0}header.nav{display:none!important}</style>')
  })

  it('adds a style tag when the document has no existing style tag', () => {
    const html = '<html><head><title>BATANG</title></head><body><header class="nav"></header></body></html>'

    expect(buildStaticHtmlSource(html)).toContain(
      '<style>header.nav{display:none!important}</style></head>',
    )
  })

  it('prepends a style tag when the document has no head tag', () => {
    const html = '<body><header class="nav"></header></body>'

    expect(buildStaticHtmlSource(html).startsWith('<style>header.nav{display:none!important}</style>')).toBe(true)
  })

  it('does not add the hidden header rule when shouldHideStaticHeader is false', () => {
    const html = '<html><head><title>BATANG</title></head><body><header class="nav"></header></body></html>'

    expect(buildStaticHtmlSource(html, { shouldHideStaticHeader: false })).not.toContain(
      'header.nav{display:none!important}',
    )
  })
})
