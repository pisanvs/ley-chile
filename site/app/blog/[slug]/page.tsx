import Link from 'next/link'
import { notFound } from 'next/navigation'
import { articleJsonLd, breadcrumbJsonLd, jsonLdScript, SITE } from '@/lib/jsonld'
import { getPost, listPosts, POSTS } from '@/lib/blog'
import { fechaLarga } from '@/lib/seo'

interface Props { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return {}
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `${SITE}/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      publishedTime: post.published,
      url: `${SITE}/blog/${post.slug}`,
    },
  }
}

// Resolve before JSX; no <Suspense>. See the reader routes.
export default async function Page({ params }: Props) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()
  const { Body } = post
  const others = listPosts().filter((p) => p.slug !== post.slug).slice(0, 2)

  return (
    <div className="flex-1 overflow-y-auto scrollbar-quiet">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(articleJsonLd({
            title: post.title,
            description: post.description,
            path: `/blog/${post.slug}`,
            published: post.published,
            modified: post.modified,
          })),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(breadcrumbJsonLd([
            { name: 'Blog', path: '/blog' },
            { name: post.title, path: `/blog/${post.slug}` },
          ])),
        }}
      />

      <article className="px-6 md:px-12 max-w-2xl mx-auto pt-14 pb-20">
        <Link href="/blog" className="text-xs uppercase tracking-[0.25em] text-ink-faint hover:text-ink transition">
          ← Blog
        </Link>

        <h1 className="mt-5 font-display text-3xl md:text-[2.7rem] leading-[1.08] tracking-tight text-balance">
          {post.title}
        </h1>
        <p className="mt-4 font-display italic text-lg md:text-xl text-ink-soft text-balance">
          {post.standfirst}
        </p>
        <p className="mt-5 text-[12px] uppercase tracking-widest text-ink-faint">
          <time dateTime={post.published}>{fechaLarga(post.published)}</time>
          {post.tags.length > 0 && <> · {post.tags.join(' · ')}</>}
        </p>

        <div className="mt-10 border-t border-rule pt-2">
          <Body />
        </div>

        <footer className="mt-16 border-t border-rule pt-8">
          <p className="text-xs text-ink-faint">
            Los datos provienen de fuentes públicas de la Biblioteca del Congreso Nacional. Este
            sitio no es una fuente oficial ni entrega asesoría legal: para efectos legales la
            referencia es{' '}
            <a href="https://www.leychile.cl" target="_blank" rel="noreferrer" className="hover:text-ink underline">
              leychile.cl
            </a>
            .
          </p>

          {others.length > 0 && (
            <div className="mt-10">
              <h2 className="font-display text-lg mb-4">Seguir leyendo</h2>
              <ul className="divide-y divide-rule border-t border-rule">
                {others.map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={`/blog/${p.slug}`}
                      className="group block py-4 hover:bg-paper-sunk/50 -mx-2 px-2 rounded transition"
                    >
                      <span className="font-display text-[1.05rem] leading-snug text-ink group-hover:text-ruby transition">
                        {p.title}
                      </span>
                      <span className="mt-1 block text-[13px] text-ink-soft line-clamp-2">
                        {p.description}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </footer>
      </article>
    </div>
  )
}
