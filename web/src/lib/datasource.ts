const BASE = import.meta.env.BASE_URL ?? '/'
const REPO = import.meta.env.VITE_REPO ?? 'pisanvs/ley-chile'

function joinBase(rel: string): string {
  return (BASE.endsWith('/') ? BASE : BASE + '/') + rel.replace(/^\//, '')
}

export const ds = {
  manifestUrl: () => joinBase('idx/manifest.json'),
  modifiesUrl: (causaId: number) => joinBase(`idx/modifies/${causaId}.json`),
  modifiedByUrl: (targetId: number) => joinBase(`idx/modified_by/${targetId}.json`),
  commitsUrl: (idNorma: number) => joinBase(`idx/commits/${idNorma}.json`),
  titlesUrl: () => joinBase('idx/titles.json'),
  byNumeroUrl: () => joinBase('idx/by-numero.json'),
  landingUrl: () => joinBase('idx/landing.json'),
  yearUrl: (year: number) => joinBase(`idx/by-year/${year}.json`),
  rawTextUrl: (sha: string, relPath: string) =>
    `https://raw.githubusercontent.com/${REPO}/${sha}/${relPath}`,
  /** Permalink to the historial commit on GitHub. */
  commitUrl: (sha: string) => `https://github.com/${REPO}/commit/${sha}`,
}

export const searchUrl = ds.titlesUrl
export const landingUrl = ds.landingUrl
export const byNumeroUrl = ds.byNumeroUrl
