import { ds } from './datasource'

export async function fetchRawText({ sha, relDir }: { sha: string; relDir: string }): Promise<string> {
  const url = ds.rawTextUrl(sha, `${relDir}/texto.md`)
  const r = await fetch(url)
  if (!r.ok) throw new Error(`raw text ${url}: ${r.status}`)
  return await r.text()
}
