import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { SITE } from '@/lib/jsonld'
import {
  canonicalPath, getAvisos, getCanonicalNorma, getKeySiblings, getNormaById,
  getRefundido, getVersions,
} from '@/lib/norma'
import { canonicalHref } from '@/lib/href'
import { normaSlug } from '@/lib/slug'
import { fechaLarga, normaLabel } from '@/lib/seo'
import { AvisoBanner } from '@/components/AvisoBanner'
import { LawView } from '@/components/LawView'

/**
 * THE canonical norma route: `/norma/{idNorma}/{slug}[/{fecha}]`.
 *
 * idNorma is the only real key. Measured over the corpus, (tipo, numero) —
 * the address this site used to canonicalize on — is shared by 91.7% of
 * normas, so it could only ever point at one of them and left 320k+ with no
 * canonical URL of their own. Adding año and organismo does not rescue it
 * (still 45k collisions) and both fields are lossy and unstable. So the id
 * addresses, and the slug is decoration.
 *
 * Everything that is not the exact canonical form 301s here rather than
 * rendering a duplicate: the bare id, a bare fecha, a stale slug from before a
 * title fix, a hand-edited URL. One page per norma, one address per page.
 */
interface Props { params: Promise<{ id: string; rest?: string[] }> }

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

function parseId(id: string): number | null {
  return /^\d+$/.test(id) ? Number(id) : null
}

/** Split the path tail into its (slug, fecha) parts.
 *
 *  A single segment is ambiguous by shape alone, so it is read as a fecha when
 *  it looks like one and a slug otherwise — that makes the legacy
 *  `/norma/{id}/{fecha}` form (which this route replaces) redirect cleanly
 *  instead of being mistaken for a very stale slug and losing the date. */
function parseTail(rest: string[]): { slug?: string; fecha?: string; bad?: true } {
  if (rest.length === 0) return {}
  if (rest.length === 1) {
    return FECHA_RE.test(rest[0]) ? { fecha: rest[0] } : { slug: rest[0] }
  }
  if (rest.length === 2) {
    return FECHA_RE.test(rest[1]) ? { slug: rest[0], fecha: rest[1] } : { bad: true }
  }
  return { bad: true }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, rest = [] } = await params
  const nid = parseId(id)
  const { fecha, bad } = parseTail(rest)
  if (nid === null || bad) return {}
  const norma = await getNormaById(nid)
  if (!norma) return {}
  const versions = await getVersions(norma.idNorma)
  // Self-canonical, always. canonicalPath collapses a dated URL onto the
  // undated one for single-version normas, which is most of the corpus.
  const canonical = fecha ? canonicalPath(norma, fecha, versions) : canonicalHref(norma)
  const title = fecha
    ? `${norma.titulo} — texto al ${fecha}`
    : norma.organismo ? `${norma.titulo} — ${norma.organismo}` : norma.titulo
  const description =
    `${normaLabel(norma)}${norma.organismo ? ` — ${norma.organismo}` : ''}. ` +
    `Publicada el ${fechaLarga(norma.fechaPublicacion)}. Texto completo, historial de versiones y modificaciones.`
  return {
    title,
    openGraph: { title, description },
    alternates: { canonical: `${SITE}${canonical}` },
  }
}

// Deliberately NOT wrapped in <Suspense>: resolve BEFORE anything streams.
// Streaming the shell commits HTTP 200, after which notFound() can no longer
// set a status and every miss becomes a soft-404 — across ~333k pages that is
// precisely the SEO failure this port exists to avoid.
export default async function Page({ params }: Props) {
  const { id, rest = [] } = await params
  const nid = parseId(id)
  if (nid === null) notFound()
  const { slug, fecha, bad } = parseTail(rest)
  if (bad) notFound()

  const norma = await getNormaById(nid)
  if (!norma) notFound()

  // The one normalization gate. A stale slug costs a redirect, never a 404 —
  // which is what lets the slug be regenerated freely as data improves.
  if (slug !== normaSlug(norma)) permanentRedirect(canonicalHref(norma, fecha))

  const [canon, avisos, refundido] = await Promise.all([
    getCanonicalNorma(norma.tipo, norma.numero),
    getAvisos(norma.idNorma),
    getRefundido(norma.idNorma),
  ])
  const total = canon?.total ?? 1
  // Still worth surfacing key-siblings inline: a reader who landed here from a
  // citation may well have wanted a different DFL 4.
  const siblings = total > 1 ? await getKeySiblings(norma.tipo, norma.numero, norma.idNorma) : []
  return (
    <LawView
      tipo={norma.tipo}
      numero={norma.numero}
      idNorma={norma.idNorma}
      fecha={fecha}
      siblings={siblings}
      siblingTotal={total}
      versionBase={canonicalHref(norma)}
      banner={<AvisoBanner avisos={avisos} refundido={refundido} />}
    />
  )
}
