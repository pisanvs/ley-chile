/** Escape markdown-significant characters in raw legal text before it goes
 *  through ReactMarkdown.
 *
 *  The corpus is government legal/administrative text, not authored
 *  markdown — but it routinely contains characters that ARE markdown
 *  syntax by coincidence: footnote markers ("(*)"), plain-text bullets
 *  ("* Ver instrucciones..."), and — worst — multiplication in formulas
 *  ("P = (IP / PE + IT) * 100", common in banking/financial circulars).
 *  A single unpaired `*` doesn't just misrender locally: CommonMark pairs
 *  it with the NEXT `*`-like delimiter anywhere later in the same block,
 *  which can italicize everything in between — sometimes thousands of
 *  characters, across paragraphs.
 *
 *  The one markdown syntax the pipeline itself intentionally emits into
 *  this text is the "#### " article-heading prefix (see CLAUDE.md's
 *  `_MD_HEADING_RE` note) — genuine ATX headings at the start of a line are
 *  left alone. Every other occurrence of a markdown-special character is
 *  escaped, since none of it is ever intentional in source legal text.
 */
const HEADING_START = /^\s{0,3}#{1,6} /
const INLINE_SPECIAL = /[`*_~[\]<|#]/g

export function escapeLegalMarkdown(text: string): string {
  return text
    .split('\n')
    .map(line => (HEADING_START.test(line) ? line : line.replace(INLINE_SPECIAL, '\\$&')))
    .join('\n')
}
