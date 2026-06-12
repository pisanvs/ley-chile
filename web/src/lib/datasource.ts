const BASE = import.meta.env.BASE_URL ?? '/'
const REPO = import.meta.env.VITE_REPO ?? 'pisanvs/ley-chile'
// Allow overriding the data origin (e.g. point at prod GH Pages while running locally)
const DATA_BASE = import.meta.env.VITE_DATA_BASE ?? BASE

function joinBase(rel: string): string {
  return (DATA_BASE.endsWith('/') ? DATA_BASE : DATA_BASE + '/') + rel.replace(/^\//, '')
}

export const ds = {
  manifestUrl: () => joinBase('idx/manifest.json'),
  modifiesUrl: (causaId: number) => joinBase(`idx/modifies/${causaId}.json`),
  modifiedByUrl: (targetId: number) => joinBase(`idx/modified_by/${targetId}.json`),
  commitsUrl: (idNorma: number) => joinBase(`idx/commits/${idNorma}.json`),
  titlesUrl: () => joinBase('idx/titles.json'),
  byNumeroUrl: () => joinBase('idx/by-numero.json'),
  landingUrl: () => joinBase('idx/landing.json'),
  rawTextUrl: (sha: string, relPath: string) =>
    `https://raw.githubusercontent.com/${REPO}/${sha}/${relPath}`,
}

export const searchUrl = ds.titlesUrl
export const landingUrl = ds.landingUrl
export const byNumeroUrl = ds.byNumeroUrl
