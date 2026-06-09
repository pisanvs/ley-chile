import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useQuery } from '@tanstack/react-query'
import { fetchRawText } from '@/lib/rawtext'

interface Props { sha: string; relDir: string }

export function CleanReader({ sha, relDir }: Props) {
  const q = useQuery({
    queryKey: ['rawtext', sha, relDir],
    queryFn: () => fetchRawText({ sha, relDir }),
    staleTime: Infinity,
  })
  if (q.isLoading) return <div className="opacity-60">Cargando texto…</div>
  if (q.isError) return <div className="text-ruby">No se pudo cargar el texto.</div>
  return (
    <article className="prose-reader font-body leading-relaxed text-[15px] max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="font-display text-2xl mt-8 mb-3">{children}</h1>,
          h2: ({ children }) => <h2 className="font-display text-xl mt-6 mb-2">{children}</h2>,
          h3: ({ children, ...rest }) => <h3 className="font-semibold mt-5 mb-1" {...rest}>{children}</h3>,
          p:  ({ children }) => <p className="my-3">{children}</p>,
        }}
      >
        {q.data}
      </ReactMarkdown>
    </article>
  )
}
