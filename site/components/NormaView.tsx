import Link from 'next/link'
import { legislationJsonLd } from '@/lib/jsonld'
import { currentFecha, isMultiVersion, type Article, type Norma, type Version } from '@/lib/norma'
import { TopBar } from './TopBar'
import { ArticleView } from './ArticleView'
import { VersionScrubber } from './VersionScrubber'
import { CopyButton } from './CopyButton'
import { ReaderTabs } from './ReaderTabs'
import { RedlineView } from './RedlineView'

const TIPO_LABEL: Record<string, string> = {
  ley: 'Ley', dl: 'Decreto Ley', dfl: 'DFL', dto: 'Decreto', cod: 'Código', res: 'Resolución',
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`
}

export function NormaView({
  norma, fecha, versions, articles, prevArticles = [], mods,
}: {
  norma: Norma; fecha: string; versions: Version[]; articles: Article[]
  prevArticles?: Article[]; mods: number[]
}) {
  const isCurrent = fecha === currentFecha(versions)
  const multi = isMultiVersion(versions)
  const tipoLabel = TIPO_LABEL[norma.tipo] ?? norma.tipo.toUpperCase()

  const status = norma.derogado
    ? { text: 'Derogada', cls: 'bg-ruby-soft text-ruby' }
    : isCurrent
      ? { text: 'Vigente', cls: 'bg-moss-soft text-moss' }
      : { text: 'Versión histórica', cls: 'bg-indigo-soft text-indigo' }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(legislationJsonLd(norma, fecha, versions, mods)) }}
      />
      <TopBar />

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:py-12">
        {/* Reader column */}
        <main className="min-w-0">
          <header className="lc-fade-up border-b border-rule pb-6">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-ink-faint">
              <span>{tipoLabel} {norma.numero}</span>
              <span aria-hidden>·</span>
              <span>{norma.fechaPublicacion ? fmtDate(norma.fechaPublicacion) : '—'}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] tracking-wide ${status.cls}`}>{status.text}</span>
            </div>

            <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-ink text-balance md:text-4xl">
              {norma.titulo}
            </h1>

            {norma.organismo && (
              <p className="mt-2 font-body text-[15px] italic text-ink-soft">{norma.organismo}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-ink-faint">Texto vigente al <span className="text-ink-soft">{fmtDate(fecha)}</span></span>
              <CopyButton
                text={`${tipoLabel} ${norma.numero}, texto al ${fecha}. LeyChile.`}
                label="Copiar cita"
                done="✓ Copiado"
                className="rounded-md border border-rule px-2.5 py-1 text-xs text-ink-soft transition-colors hover:border-indigo hover:text-indigo"
              >
                Copiar cita
              </CopyButton>
            </div>

            {multi && (
              <div className="mt-4">
                <VersionScrubber
                  tipo={norma.tipo}
                  numero={norma.numero}
                  versions={versions}
                  activeDesde={fecha}
                  currentDesde={currentFecha(versions)}
                />
              </div>
            )}
          </header>

          <div className="mt-8">
            <ReaderTabs
              clean={
                <div className="space-y-8">
                  {articles.map((a) => (
                    <ArticleView key={a.slug} article={a} />
                  ))}
                </div>
              }
              redline={
                prevArticles.length > 0
                  ? <RedlineView prev={prevArticles} curr={articles} />
                  : null
              }
            />
          </div>
        </main>

        {/* Right rail */}
        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <div className="rounded-xl border border-rule bg-paper-raised p-5">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Versión</h3>
            <p className="mt-2 font-display text-2xl text-ink">{fmtDate(fecha)}</p>
            <p className="text-sm text-ink-soft">
              {!multi ? 'Texto único' : isCurrent ? 'Versión vigente' : 'Versión histórica'}
            </p>

            {multi && (
              <>
                <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Cronología</h3>
                <ol className="mt-2 space-y-1 text-sm">
                  {versions.map((v, i) => {
                    const active = v.desde === fecha
                    const href = v.desde === currentFecha(versions) ? `/${norma.tipo}/${norma.numero}` : `/${norma.tipo}/${norma.numero}/${v.desde}`
                    return (
                      <li key={v.desde}>
                        <Link
                          href={href}
                          className={`flex items-baseline justify-between gap-2 rounded-md px-2 py-1 transition-colors hover:bg-paper-sunk ${active ? 'text-ruby font-medium' : 'text-ink-soft'}`}
                        >
                          <span>{fmtDate(v.desde)}</span>
                          <span className="font-mono text-xs text-ink-faint">v{i + 1}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              </>
            )}

            {mods.length > 0 && (
              <>
                <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Modificaciones</h3>
                <p className="mt-2 text-sm text-ink-soft">
                  Modificada por <span className="font-medium text-ink">{mods.length}</span>{' '}
                  {mods.length === 1 ? 'norma' : 'normas'}.
                </p>
              </>
            )}
          </div>

          <p className="mt-4 px-1 text-xs text-ink-faint">
            {articles.length} {articles.length === 1 ? 'artículo' : 'artículos'} en esta versión.
          </p>
        </aside>
      </div>
    </>
  )
}
