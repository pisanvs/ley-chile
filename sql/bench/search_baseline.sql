-- Baseline measurements for the Meilisearch → Postgres decision.
-- Read-only. Safe to run against production.
-- Usage: psql "$DATABASE_PUBLIC_URL" -f search_baseline.sql > baseline.txt 2>&1

\timing on
\pset pager off

\echo '=== 1. MEMORY / STORAGE SETTINGS ==='
SELECT name, setting, unit FROM pg_settings
 WHERE name IN ('shared_buffers','work_mem','maintenance_work_mem',
                'effective_cache_size','max_parallel_workers_per_gather')
 ORDER BY name;

\echo '=== 2. CORPUS SIZE ==='
SELECT 'norma' AS t, count(*) FROM norma
UNION ALL SELECT 'articulo', count(*) FROM articulo
UNION ALL SELECT 'articulo_span', count(*) FROM articulo_span
UNION ALL SELECT 'norma tier=full (Meili holds)', count(*) FROM norma WHERE index_tier='full'
UNION ALL SELECT 'norma tier=meta (Postgres only)', count(*) FROM norma WHERE index_tier='meta';

\echo '=== 3. INDEX SIZES  (compare total vs Meili volume 4.76 GB) ==='
SELECT relname,
       pg_size_pretty(pg_relation_size(oid))       AS heap,
       pg_size_pretty(pg_indexes_size(oid))        AS indexes,
       pg_size_pretty(pg_total_relation_size(oid)) AS total
  FROM pg_class WHERE relname IN ('articulo','norma','articulo_span') AND relkind='r';

SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) AS size
  FROM pg_stat_user_indexes
 WHERE indexrelname IN ('articulo_tsv_idx','norma_titulo_trgm_idx',
                        'norma_nombres_uso_comun_idx','norma_materias_idx')
 ORDER BY pg_relation_size(indexrelid) DESC;

\echo '=== 4. THE CLIFF: candidate counts, common vs rare term ==='
-- If ranking cost scales with candidates (it does), these numbers predict latency.
SELECT 'trabajo'  AS term, count(*) FROM articulo WHERE tsv @@ websearch_to_tsquery('spanish','trabajo')
UNION ALL SELECT 'contrato', count(*) FROM articulo WHERE tsv @@ websearch_to_tsquery('spanish','contrato')
UNION ALL SELECT 'estado',   count(*) FROM articulo WHERE tsv @@ websearch_to_tsquery('spanish','estado')
UNION ALL SELECT 'expropiacion', count(*) FROM articulo WHERE tsv @@ websearch_to_tsquery('spanish','expropiacion')
UNION ALL SELECT 'geotermia',    count(*) FROM articulo WHERE tsv @@ websearch_to_tsquery('spanish','geotermia');

\echo '=== 5. WIDENED COLD QUERY -- COMMON TERM (the worst case) ==='
-- Today's searchCold with the `index_tier = meta` predicate REMOVED,
-- i.e. exactly what it becomes when Meilisearch is deleted.
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT DISTINCT ON (n.id_norma)
       n.id_norma, n.tipo, n.numero, n.titulo, a.slug,
       ts_headline('spanish', a.body, websearch_to_tsquery('spanish','trabajo'),
                   'MaxWords=40, MinWords=15') AS snippet,
       ts_rank_cd(a.tsv, websearch_to_tsquery('spanish','trabajo')) AS rank
  FROM articulo a
  JOIN norma n ON n.id_norma = a.id_norma
  JOIN articulo_span s ON s.articulo_id = a.id
 WHERE a.tsv @@ websearch_to_tsquery('spanish','trabajo')
   AND s.vigencia @> CURRENT_DATE
 ORDER BY n.id_norma, rank DESC
 LIMIT 20;

\echo '=== 6. WIDENED COLD QUERY -- RARE TERM (the best case) ==='
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT DISTINCT ON (n.id_norma)
       n.id_norma, n.tipo, n.numero, n.titulo, a.slug,
       ts_headline('spanish', a.body, websearch_to_tsquery('spanish','geotermia'),
                   'MaxWords=40, MinWords=15') AS snippet,
       ts_rank_cd(a.tsv, websearch_to_tsquery('spanish','geotermia')) AS rank
  FROM articulo a
  JOIN norma n ON n.id_norma = a.id_norma
  JOIN articulo_span s ON s.articulo_id = a.id
 WHERE a.tsv @@ websearch_to_tsquery('spanish','geotermia')
   AND s.vigencia @> CURRENT_DATE
 ORDER BY n.id_norma, rank DESC
 LIMIT 20;

\echo '=== 7. HOW MUCH OF THE COST IS ts_headline? ==='
-- Same query, snippet removed. The delta is the snippet tax, and it is the
-- part a precomputed-snippet design would buy back.
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT DISTINCT ON (n.id_norma)
       n.id_norma, n.tipo, n.numero, n.titulo, a.slug,
       ts_rank_cd(a.tsv, websearch_to_tsquery('spanish','trabajo')) AS rank
  FROM articulo a
  JOIN norma n ON n.id_norma = a.id_norma
  JOIN articulo_span s ON s.articulo_id = a.id
 WHERE a.tsv @@ websearch_to_tsquery('spanish','trabajo')
   AND s.vigencia @> CURRENT_DATE
 ORDER BY n.id_norma, rank DESC
 LIMIT 20;

\echo '=== 8. ACCENT BUG: does the spanish config unaccent? ==='
-- If these disagree, raw user input silently fails to match accented text.
SELECT to_tsvector('spanish','artículo')          AS accented,
       to_tsvector('spanish','articulo')          AS plain,
       to_tsvector('spanish','artículo') @@ websearch_to_tsquery('spanish','articulo') AS does_match;

SELECT extname FROM pg_extension ORDER BY extname;

\echo '=== 9. TYPEAHEAD FEASIBILITY: norma-level trigram latency ==='
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT id_norma, tipo, numero, titulo, similarity(titulo,'partidos politicos') AS sim
  FROM norma
 WHERE titulo % 'partidos politicos'
 ORDER BY sim DESC
 LIMIT 12;
