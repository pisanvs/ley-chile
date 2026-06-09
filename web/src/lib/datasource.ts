const BASE = import.meta.env.BASE_URL ?? '/'
const REPO = import.meta.env.VITE_REPO ?? 'pisanvs/ley-chile'

function joinBase(rel: string): string {
  return (BASE.endsWith('/') ? BASE : BASE + '/') + rel.replace(/^\//, '')
}

export const ds = {
  manifestUrl: () => joinBase('idx/manifest.json'),
  commitsUrl: (idNorma: number) => joinBase(`idx/commits/${idNorma}.json`),
  rawTextUrl: (sha: string, relPath: string) =>
    `https://raw.githubusercontent.com/${REPO}/${sha}/${relPath}`,
}
