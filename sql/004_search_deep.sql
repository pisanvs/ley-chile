-- Deep article search: pick the query shape by selectivity.
--
-- Two shapes are available and each is fast exactly where the other is slow.
--
--   DENSE  `DISTINCT ON (id_norma) ... ORDER BY id_norma ... LIMIT 20`
--          walks the (id_norma, slug, content_sha256) btree in id_norma order,
--          so it never sorts — and with many matches it satisfies the LIMIT
--          within the first few thousand rows. It does NOT use articulo_tsv_idx.
--          When matches are sparse it can never accumulate 20 distinct normas
--          and degenerates into a full table scan.
--
--   SPARSE rank first over articulo_tsv_idx, cap the candidates, then dedupe.
--          Uses the GIN index, so cost tracks the number of matches — excellent
--          when they are few, poor when they are many (it must rank them all).
--
-- Measured on 100k normas / 260k articulos (Postgres 16), best of 3:
--
--   term         % corpus   dense     sparse
--   trabajo        85.0      2.5ms    508.2ms
--   contrato       16.7      2.6ms    345.8ms
--   anfibolita      5.0      5.7ms     67.5ms
--   zeolita         2.0     10.7ms     49.1ms
--   bentonita       0.5     32.6ms     44.2ms
--   tectonica       0.1    175.9ms     28.6ms
--   geotermia       0.012  663.8ms      5.6ms
--
-- Dense cost goes as N/matches and sparse cost as matches, so they cross near
-- sqrt(N) — the threshold must scale with the corpus, not sit at a fixed
-- fraction. Around the crossover both shapes are cheap, so the exact constant
-- is not delicate.

-- Document frequency per lexeme, over the whole corpus. Rebuilt by the loader;
-- ts_stat is a full scan, so this is a load-time job, never a query-time one.
CREATE TABLE IF NOT EXISTS articulo_lexeme_freq (
  lexeme text PRIMARY KEY,
  ndoc   bigint NOT NULL
);

-- Single-row config so the threshold is computed once at load rather than
-- counting articulo on every search.
CREATE TABLE IF NOT EXISTS search_config (
  only_row      boolean PRIMARY KEY DEFAULT true CHECK (only_row),
  dense_cutoff  bigint NOT NULL,
  corpus_size   bigint NOT NULL
);

CREATE OR REPLACE FUNCTION refresh_articulo_lexeme_freq()
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint; total bigint;
BEGIN
  CREATE TEMP TABLE _lex ON COMMIT DROP AS
    SELECT word AS lexeme, ndoc::bigint FROM ts_stat('SELECT tsv FROM articulo');

  TRUNCATE articulo_lexeme_freq;
  INSERT INTO articulo_lexeme_freq (lexeme, ndoc) SELECT lexeme, ndoc FROM _lex;
  GET DIAGNOSTICS n = ROW_COUNT;

  SELECT count(*) INTO total FROM articulo;
  INSERT INTO search_config (only_row, dense_cutoff, corpus_size)
  VALUES (true, GREATEST(2 * sqrt(total)::bigint, 100), total)
  ON CONFLICT (only_row) DO UPDATE
    SET dense_cutoff = EXCLUDED.dense_cutoff,
        corpus_size  = EXCLUDED.corpus_size;

  ANALYZE articulo_lexeme_freq;
  RETURN n;
END
$$;

-- Upper bound on how many articulos a query can match. The query is an AND of
-- its lexemes, so the result cannot exceed the rarest lexeme's document count.
-- An unknown lexeme matches nothing, which correctly routes to the sparse
-- shape — the cheap one when there is nothing to find.
CREATE OR REPLACE FUNCTION estimate_articulo_matches(q text)
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT COALESCE(MIN(COALESCE(f.ndoc, 0)), 0)
    FROM unnest(to_tsvector('spanish', q)) AS t(lexeme, positions, weights)
    LEFT JOIN articulo_lexeme_freq f ON f.lexeme = t.lexeme
$$;

CREATE OR REPLACE FUNCTION search_articulos_deep(
  q text, as_of date, lim int DEFAULT 20
)
RETURNS TABLE (
  id_norma int, tipo text, numero text, titulo text,
  slug text, snippet text, rank real
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  est    bigint;
  cutoff bigint;
BEGIN
  est := estimate_articulo_matches(q);
  SELECT dense_cutoff INTO cutoff FROM search_config;
  -- No config row yet (fresh database, loader has not run): the dense shape is
  -- the one that is merely slow rather than pathological on an empty corpus.
  cutoff := COALESCE(cutoff, 1000);

  IF est > cutoff THEN
    -- The inner LIMIT is what keeps this shape fast: it stops the id_norma
    -- walk as soon as `lim` distinct normas are found. That makes the *choice*
    -- of normas arbitrary with respect to relevance — lowest id_norma wins,
    -- which is also what production does today. Sorting the chosen rows by
    -- rank orders what we return but cannot recover what was never considered.
    -- Fixing that properly means ranking every match, which at this
    -- selectivity is the 500ms shape. This is the one quality gap that would
    -- justify RUM or pg_search later.
    RETURN QUERY
    SELECT * FROM (
      SELECT DISTINCT ON (n.id_norma)
             n.id_norma, n.tipo, n.numero, n.titulo, a.slug,
             ts_headline('spanish', a.body, websearch_to_tsquery('spanish', q),
                         'MaxWords=40, MinWords=15'),
             ts_rank_cd(a.tsv, websearch_to_tsquery('spanish', q))
        FROM articulo a
        JOIN norma n ON n.id_norma = a.id_norma
        JOIN articulo_span s ON s.articulo_id = a.id
       WHERE a.tsv @@ websearch_to_tsquery('spanish', q)
         AND s.vigencia @> as_of
       ORDER BY n.id_norma, ts_rank_cd(a.tsv, websearch_to_tsquery('spanish', q)) DESC
       LIMIT lim
    ) d (id_norma, tipo, numero, titulo, slug, snippet, rank)
    ORDER BY d.rank DESC;
  ELSE
    -- Cap candidates at 20x the requested rows: enough that deduping by norma
    -- still fills the page when one law matches repeatedly, small enough that
    -- ranking stays trivial at this selectivity.
    -- Dedupe by norma first (DISTINCT ON needs id_norma ordering), then
    -- restore relevance order and apply the caller's limit. Without the outer
    -- LIMIT this returned every deduped candidate — up to lim * 20 rows.
    RETURN QUERY
    SELECT * FROM (
      SELECT DISTINCT ON (c.id_norma)
             c.id_norma, n.tipo, n.numero, n.titulo, c.slug,
             ts_headline('spanish', c.body, websearch_to_tsquery('spanish', q),
                         'MaxWords=40, MinWords=15'),
             c.rank
        FROM (
          SELECT a.id_norma, a.slug, a.body,
                 ts_rank_cd(a.tsv, websearch_to_tsquery('spanish', q)) AS rank
            FROM articulo a
            JOIN articulo_span s ON s.articulo_id = a.id
           WHERE a.tsv @@ websearch_to_tsquery('spanish', q)
             AND s.vigencia @> as_of
           ORDER BY rank DESC
           LIMIT lim * 20
        ) c
        JOIN norma n ON n.id_norma = c.id_norma
       ORDER BY c.id_norma, c.rank DESC
    ) d (id_norma, tipo, numero, titulo, slug, snippet, rank)
    ORDER BY d.rank DESC
    LIMIT lim;
  END IF;
END
$$;
