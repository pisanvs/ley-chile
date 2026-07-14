/** URL builder for the app's data API. In the SSR port these are Next route
 *  handlers backed by Postgres/Meilisearch (see app/api/…), replacing the old
 *  static `idx/*.json` shards + GitHub raw text. Same shapes, live source. */
export const ds = {
  commitsUrl: (idOrNumero: number | string) => `/api/idx/commits/${idOrNumero}`,
  modifiesUrl: (causaId: number) => `/api/idx/modifies/${causaId}`,
  modifiedByUrl: (targetId: number) => `/api/idx/modified_by/${targetId}`,
  titlesUrl: () => `/api/idx/titles`,
  landingUrl: () => `/api/idx/landing`,
  manifestUrl: () => `/api/idx/manifest`,
  /** Reconstructed markdown for one version: sha == desde (fecha), relDir == idNorma. */
  textUrl: (idNorma: number | string, fecha: string) => `/api/text/${idNorma}/${fecha}`,
}

export const searchUrl = ds.titlesUrl
export const landingUrl = ds.landingUrl
