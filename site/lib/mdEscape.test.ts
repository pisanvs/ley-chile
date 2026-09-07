import { describe, it, expect } from 'vitest'
import { escapeLegalMarkdown } from './mdEscape'
import ReactMarkdown from 'react-markdown'
import { renderToStaticMarkup } from 'react-dom/server'

/** Regression fixture: idNorma 1077207 (CIRCULAR BANCOS N° 2.409), the norma
 *  that surfaced this bug — a multiplication formula whose bare `*` paired
 *  with an unrelated later `*` and ran emphasis across everything between
 *  them. */
const FORMULA_LINE = 'P = (IP / PE + IT) * 100'
const FOOTNOTE_LINE = 'Estatutos de la sociedad.(*)'
const BULLET_LINE = '* Ver instrucciones en hoja 2 de este Anexo'

describe('escapeLegalMarkdown', () => {
  it('escapes a lone multiplication asterisk', () => {
    expect(escapeLegalMarkdown(FORMULA_LINE)).toBe('P = (IP / PE + IT) \\* 100')
  })

  it('escapes a footnote-marker asterisk', () => {
    expect(escapeLegalMarkdown(FOOTNOTE_LINE)).toBe('Estatutos de la sociedad.(\\*)')
  })

  it('escapes a literal bullet so it does not become a list item', () => {
    expect(escapeLegalMarkdown(BULLET_LINE)).toBe('\\* Ver instrucciones en hoja 2 de este Anexo')
  })

  it('leaves a genuine ATX heading untouched', () => {
    expect(escapeLegalMarkdown('#### Artículo 41')).toBe('#### Artículo 41')
    expect(escapeLegalMarkdown('## Capítulo 1-1')).toBe('## Capítulo 1-1')
  })

  it('escapes a stray # that is not a heading (mid-line)', () => {
    expect(escapeLegalMarkdown('el N° 1 del artículo #80')).toBe('el N° 1 del artículo \\#80')
  })

  it('escapes underscores, tildes, backticks, brackets, and pipes', () => {
    expect(escapeLegalMarkdown('a_b ~c~ `d` [e] f|g'))
      .toBe('a\\_b \\~c\\~ \\`d\\` \\[e\\] f\\|g')
  })

  it('round-trips through ReactMarkdown back to the original plain text', () => {
    const paragraph = [FORMULA_LINE, '', FOOTNOTE_LINE, '', BULLET_LINE].join('\n')
    const html = renderToStaticMarkup(
      ReactMarkdown({ children: escapeLegalMarkdown(paragraph) }) as any,
    )
    // No emphasis, no list — the formula's "*" must not have opened an
    // <em> that swallows everything up to the bullet line's "*".
    expect(html).not.toMatch(/<em>/)
    expect(html).not.toMatch(/<li>/)
    expect(html).toContain('P = (IP / PE + IT) * 100')
    expect(html).toContain('Estatutos de la sociedad.(*)')
    expect(html).toContain('* Ver instrucciones en hoja 2 de este Anexo')
  })
})
