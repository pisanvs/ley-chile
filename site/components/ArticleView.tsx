import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CopyButton } from './CopyButton'
import type { Article } from '@/lib/norma'

/** One article segment: stable anchor, display heading, markdown body, permalink. */
export function ArticleView({ article }: { article: Article }) {
  const anchor = `art-${article.slug}`
  return (
    <section id={anchor} className="group relative scroll-mt-24">
      {article.rawHeading && (
        <div className="mb-1 flex items-baseline gap-2">
          <h2 className="font-display text-xl font-semibold text-ink">{article.rawHeading}</h2>
          <CopyButton
            hash={`#${anchor}`}
            label="Copiar enlace a este artículo"
            done="✓"
            className="text-ink-faint opacity-0 transition-opacity hover:text-indigo group-hover:opacity-100"
          >
            #
          </CopyButton>
        </div>
      )}
      <div className="prose-reader font-body text-[15.5px] leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }: { children?: React.ReactNode }) => <h1 className="font-display text-2xl mt-6 mb-3">{children}</h1>,
            h2: ({ children }: { children?: React.ReactNode }) => <h2 className="font-display text-xl mt-5 mb-2">{children}</h2>,
            h3: ({ children }: { children?: React.ReactNode }) => <h3 className="font-semibold mt-4 mb-1">{children}</h3>,
            p: ({ children }: { children?: React.ReactNode }) => <p className="my-3">{children}</p>,
          }}
        >
          {article.body}
        </ReactMarkdown>
      </div>
    </section>
  )
}
