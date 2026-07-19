-- Metadata recovered from LeyChile, plus typed relations between normas.
--
-- Purely additive and idempotent, which is what makes the deploy order safe:
-- this can be applied to the live database before the export that populates it
-- exists. Until then the columns hold their defaults and every reader sees
-- "no data" rather than an error.

-- How people actually refer to a norma ("ley de partidos", "Código de
-- Comercio"). Only the formal título was ever indexed, so searching the common
-- name — the way almost everyone searches — matched nothing.
ALTER TABLE norma ADD COLUMN IF NOT EXISTS nombres_uso_comun text[] NOT NULL DEFAULT '{}';

-- BCN's subject classification. The best free relevance signal we have for a
-- text search that misses the título.
ALTER TABLE norma ADD COLUMN IF NOT EXISTS materias text[] NOT NULL DEFAULT '{}';

-- LeyChile's own warnings, and the reason they matter: they flag
-- article-numbering anomalies ("LA NUMERACION DE LOS ARTICULOS DEL TEXTO
-- PUBLICADO REPITE EL Nº 2"). Citing an article number in such a norma is
-- actively unsafe, and we were being told so and discarding it.
ALTER TABLE norma ADD COLUMN IF NOT EXISTS observaciones text[] NOT NULL DEFAULT '{}';
ALTER TABLE norma ADD COLUMN IF NOT EXISTS doble_articulado boolean NOT NULL DEFAULT false;

-- Raw "DFL-2; DFL-2-95" text. Display only: these are tipo-numero tokens, not
-- idNormas, and cannot be resolved ("DFL 2" names 138 normas). The resolvable
-- edges live in `relacion`.
ALTER TABLE norma ADD COLUMN IF NOT EXISTS refundido_por text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS norma_nombres_uso_comun_idx ON norma USING gin (nombres_uso_comun);
CREATE INDEX IF NOT EXISTS norma_materias_idx ON norma USING gin (materias);

-- Typed relations, currently the refundido pair from BCN's recasts /
-- isRecastedBy. Kept out of `modificacion` on purpose: a modificación is dated
-- and carries the commit that produced it, a refundido is a standing
-- structural fact with no date of its own, and merging them would mean a
-- nullable fecha plus a type column that changes what the other columns mean.
--
-- No foreign keys, matching `modificacion`: ~1.8k referenced ids have no norma
-- row (the export only emits normas that have their own law_dir), and a FK
-- would also couple this table to shard load order.
CREATE TABLE IF NOT EXISTS relacion (
  origen_id  integer NOT NULL,
  destino_id integer NOT NULL,
  tipo       text NOT NULL CHECK (tipo IN ('refunde', 'refundida_en')),
  PRIMARY KEY (origen_id, destino_id, tipo)
);

-- Both directions are stored, so "what supersedes this?" and "what does this
-- consolidate?" are both a single index hit.
CREATE INDEX IF NOT EXISTS relacion_destino_idx ON relacion (destino_id, tipo);
