import { ds } from './datasource'

/** Reconstructed markdown text of one version. `sha` is the version date and
 *  `relDir` the idNorma (see commits API); together they key the /api/text route. */
export async function fetchRawText({ sha, relDir }: { sha: string; relDir: string }): Promise<string> {
  const url = ds.textUrl(relDir, sha)
  const r = await fetch(url)
  if (!r.ok) throw new Error(`raw text ${url}: ${r.status}`)
  return await r.text()
}
