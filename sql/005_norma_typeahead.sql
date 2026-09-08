-- Typeahead over norma_search: two stages, cheap one first.
--
-- Measured on 100k normas (Postgres 16), best of 3:
--
--   stage                              latency
--   tsv + prominence  (correct spelling)   0.4 - 2.6 ms
--   trigram fallback  (typo)              ~35 ms
--   combined in one query (rejected)      35 - 65 ms
--
-- Scoring `word_similarity()` over every tsv match is what made the combined
-- query slow — a single title word matches thousands of normas, and each one
-- pays for a trigram comparison it did not need. Reserving the trigram stage
-- for queries the lexeme stage could not answer keeps the common case, a
-- correctly-spelled query, at single-digit milliseconds.
--
-- This is the same hot/cold shape the deep path already uses: try the cheap
-- exhaustive-enough thing, fall through only when it comes up thin.

CREATE OR REPLACE FUNCTION search_normas_typeahead(q text, lim int DEFAULT 12)
RETURNS TABLE (id_norma int, tipo text, numero text, titulo text, score real)
LANGUAGE plpgsql STABLE
-- Function-local so lowering the threshold cannot leak into other queries
-- on the same connection.
SET pg_trgm.word_similarity_threshold = 0.5
AS $$
DECLARE
  found  int;
  tsq    tsquery := websearch_to_tsquery('spanish_unaccent', q);
BEGIN
  -- Stage 1 — lexeme match. `prominence` caps the candidate set before any
  -- ranking, so a query word matching thousands of normas still scores only
  -- the most prominent 200 of them.
  RETURN QUERY
  SELECT ns.id_norma, ns.tipo, ns.numero, ns.titulo,
         (ts_rank_cd(ns.tsv, tsq) * 4 + ns.prominence)::real AS sc
    FROM (
      SELECT s.id_norma
        FROM norma_search s
       WHERE s.tsv @@ tsq
       ORDER BY s.prominence DESC
       LIMIT 200
    ) c
    JOIN norma_search ns USING (id_norma)
   ORDER BY sc DESC
   LIMIT lim;

  GET DIAGNOSTICS found = ROW_COUNT;
  IF found >= 5 THEN
    RETURN;
  END IF;

  -- Stage 2 — trigram fallback for misspellings. Excluding rows the lexeme
  -- stage already matched keeps the two stages disjoint, so no dedupe is
  -- needed and a partially-successful stage 1 is topped up rather than
  -- duplicated.
  RETURN QUERY
  SELECT ns.id_norma, ns.tipo, ns.numero, ns.titulo,
         (word_similarity(q, ns.nombre_txt) * 2 + ns.prominence)::real AS sc
    FROM (
      SELECT s.id_norma
        FROM norma_search s
       WHERE q <% s.nombre_txt
         AND NOT (s.tsv @@ tsq)
       ORDER BY s.prominence DESC
       LIMIT 200
    ) c
    JOIN norma_search ns USING (id_norma)
   ORDER BY sc DESC
   LIMIT lim - found;
END
$$;
