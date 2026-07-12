import { legislationJsonLd } from '@/lib/jsonld'
import { currentFecha, type Article, type Norma, type Version } from '@/lib/norma'

export function NormaView(
  { norma, fecha, versions, articles, mods }:
  { norma: Norma; fecha: string; versions: Version[]; articles: Article[]; mods: number[] },
) {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(legislationJsonLd(norma, fecha, versions, mods)),
        }}
      />
      <h1>{norma.titulo}</h1>
      <p>
        {norma.tipo.toUpperCase()} {norma.numero} · texto vigente al {fecha}
        {fecha !== currentFecha(versions) && ' (versión histórica)'}
      </p>
      {articles.map(a => (
        <section key={a.slug} id={a.slug}>
          {a.rawHeading && <h2>{a.rawHeading}</h2>}
          <div>{a.body}</div>
        </section>
      ))}
    </main>
  )
}
