-- norma_search: the typeahead read model.
--
-- Per-keystroke search is a *norma-level* question — "which law is this?" —
-- answered by title, common name, or number. It is not a full-text sweep of
-- every article body in Chilean law. Separating the two is what makes an
-- instant palette affordable without Meilisearch.
--
-- One row per norma (~358k). No joins, no validity filter: a norma's identity
-- does not change with the as-of date, only its text does, and typeahead shows
-- no text. That makes this a single-table lookup over a small index that stays
-- resident in shared_buffers.
--
-- Derived and rebuildable from `norma`, like every other read model here.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Postgres's stock `spanish` configuration stems but does NOT strip accents,
-- so `articulo` never matched `artículo` on any Postgres path — the client
-- only folded accents on the way to Meilisearch. Folding belongs in the
-- configuration, where both the indexed text and the query pass through it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'spanish_unaccent') THEN
    CREATE TEXT SEARCH CONFIGURATION spanish_unaccent (COPY = spanish);
    ALTER TEXT SEARCH CONFIGURATION spanish_unaccent
      ALTER MAPPING FOR hword, hword_part, word
      WITH unaccent, spanish_stem;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS norma_search (
  id_norma   integer PRIMARY KEY REFERENCES norma (id_norma) ON DELETE CASCADE,
  tipo       text NOT NULL,
  numero     text,
  titulo     text NOT NULL,
  -- Title and common names as one unaccented lowercase string: the surface
  -- trigram similarity runs against. Kept separate from `tsv` because trigram
  -- matching needs raw characters, not lexemes.
  nombre_txt text NOT NULL,
  tsv        tsvector NOT NULL,
  -- Higher sorts first. (tipo, numero) is not unique — "1" alone is ~450
  -- decretos — so without a prominence order the one law the user meant
  -- drowns in near-identical citations.
  prominence real NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS norma_search_tsv_idx
  ON norma_search USING gin (tsv);
CREATE INDEX IF NOT EXISTS norma_search_nombre_trgm_idx
  ON norma_search USING gin (nombre_txt gin_trgm_ops);
CREATE INDEX IF NOT EXISTS norma_search_numero_idx
  ON norma_search (numero, tipo);
-- Supports the bare-prefix case, where there is no ranking signal but the
-- palette still has to return *something* useful instantly.
CREATE INDEX IF NOT EXISTS norma_search_prominence_idx
  ON norma_search (prominence DESC, id_norma);

-- Substantive legislation outranks the hundreds of thousands of numbered
-- decretos and resoluciones that share every low number. This replaces the
-- TIPO_RANK constant currently duplicated in site/lib/search.ts and
-- scripts/loader/index_meili.py.
CREATE OR REPLACE FUNCTION norma_search_tipo_weight(tipo text)
RETURNS real LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE tipo
    WHEN 'ley' THEN 1.0 WHEN 'cod' THEN 1.0
    WHEN 'dl'  THEN 0.8 WHEN 'dfl' THEN 0.8
    WHEN 'dto' THEN 0.3
    WHEN 'res' THEN 0.1
    ELSE 0.2 END::real
$$;

-- Full rebuild. Cheap enough at this size to prefer over incremental
-- maintenance, and it keeps the loader's failure modes simple: the table is
-- either the previous good state or the new one, never a half-applied mix.
CREATE OR REPLACE FUNCTION refresh_norma_search()
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  CREATE TEMP TABLE _ns_new ON COMMIT DROP AS
  SELECT
    n.id_norma,
    n.tipo,
    n.numero,
    n.titulo,
    lower(unaccent(
      n.titulo || ' ' || COALESCE(array_to_string(n.nombres_uso_comun, ' '), '')
    )) AS nombre_txt,
    -- `nombres_uso_comun` carries weight A alongside the título because it is
    -- how people actually refer to a law ("ley de partidos", "Código de
    -- Comercio"); indexing only the formal título means the most natural query
    -- for a law matches nothing. `materias` is B: useful signal, broad enough
    -- to over-match if it ranked equal to the name.
    setweight(to_tsvector('spanish_unaccent', n.titulo), 'A')
      || setweight(to_tsvector('spanish_unaccent',
           COALESCE(array_to_string(n.nombres_uso_comun, ' '), '')), 'A')
      || setweight(to_tsvector('spanish_unaccent',
           COALESCE(array_to_string(n.materias, ' '), '')), 'B') AS tsv,
    (
      norma_search_tipo_weight(n.tipo)
      -- A heavily amended law is a law people actually use. log dampens it so
      -- the Código del Trabajo does not swamp every unrelated query.
      + ln(1 + COALESCE(m.mods, 0))::real * 0.15
      -- Observed usage, previously the tier-promotion trigger. As a ranking
      -- input it is no longer self-fulfilling: every norma is findable, so a
      -- zero score costs position, never visibility.
      + LEAST(COALESCE(s.score, 0), 50)::real * 0.02
    )::real AS prominence
  FROM norma n
  LEFT JOIN (
    -- `target_id` is the norma being amended; counting `causa_id` instead
    -- would score the amending decreto rather than the law people search for.
    SELECT target_id AS id_norma, count(*) AS mods
      FROM modificacion GROUP BY target_id
  ) m ON m.id_norma = n.id_norma
  LEFT JOIN analytics.norma_signal s ON s.id_norma = n.id_norma;

  -- Swap in one transaction so readers never see an empty table.
  TRUNCATE norma_search;
  INSERT INTO norma_search
    (id_norma, tipo, numero, titulo, nombre_txt, tsv, prominence)
  SELECT id_norma, tipo, numero, titulo, nombre_txt, tsv, prominence
    FROM _ns_new;

  GET DIAGNOSTICS n = ROW_COUNT;
  ANALYZE norma_search;
  RETURN n;
END
$$;
