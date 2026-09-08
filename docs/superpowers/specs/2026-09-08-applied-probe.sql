SET statement_timeout = '600s';
-- warm each, then measure server-side execution time only
SELECT count(*) FROM search_normas_typeahead('partidos politicos',12);
SELECT count(*) FROM search_normas_typeahead('codigo del trabajo',12);
SELECT count(*) FROM search_normas_typeahead('partidos politicoss',12);
SELECT count(*) FROM search_articulos_deep('geotermia', CURRENT_DATE, 20);
SELECT count(*) FROM search_articulos_deep('expropiacion', CURRENT_DATE, 20);
SELECT count(*) FROM search_articulos_deep('contrato', CURRENT_DATE, 20);
\echo '@@ typeahead partidos politicos'
EXPLAIN (ANALYZE, TIMING OFF) SELECT * FROM search_normas_typeahead('partidos politicos',12);
\echo '@@ typeahead codigo del trabajo'
EXPLAIN (ANALYZE, TIMING OFF) SELECT * FROM search_normas_typeahead('codigo del trabajo',12);
\echo '@@ typeahead TYPO partidos politicoss'
EXPLAIN (ANALYZE, TIMING OFF) SELECT * FROM search_normas_typeahead('partidos politicoss',12);
\echo '@@ deep geotermia (sparse)'
EXPLAIN (ANALYZE, TIMING OFF) SELECT * FROM search_articulos_deep('geotermia', CURRENT_DATE, 20);
\echo '@@ deep expropiacion (sparse)'
EXPLAIN (ANALYZE, TIMING OFF) SELECT * FROM search_articulos_deep('expropiacion', CURRENT_DATE, 20);
\echo '@@ deep contrato (dense)'
EXPLAIN (ANALYZE, TIMING OFF) SELECT * FROM search_articulos_deep('contrato', CURRENT_DATE, 20);
