-- Derived read model. Droppable: everything here rebuilds from snapshot artifacts.
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- fuzzy título lookup (cold-path fallback)
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- EXCLUDE mixes `=` (btree) with `&&` (gist)

CREATE TABLE IF NOT EXISTS norma (
  id_norma           integer PRIMARY KEY,
  tipo               text NOT NULL,
  numero             text NOT NULL,
  titulo             text NOT NULL,
  organismo          text,
  clasificacion      text,
  derogado           boolean NOT NULL DEFAULT false,
  fecha_publicacion  date,
  law_dir            text NOT NULL,
  index_tier         text NOT NULL DEFAULT 'meta' CHECK (index_tier IN ('full','meta')),
  seeded             boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS norma_tipo_numero_idx ON norma (tipo, numero);
CREATE INDEX IF NOT EXISTS norma_titulo_trgm_idx ON norma USING gin (titulo gin_trgm_ops);
CREATE INDEX IF NOT EXISTS norma_tier_idx ON norma (index_tier);

CREATE TABLE IF NOT EXISTS version (
  id                bigserial PRIMARY KEY,
  id_norma          integer NOT NULL REFERENCES norma ON DELETE CASCADE,
  desde             date NOT NULL,
  hasta             date,
  commit_sha        text NOT NULL,
  causa_id          integer,
  subject           text,
  magnitude         integer,
  texto_sha256      text NOT NULL,      -- sha256 of committed texto.md (provenance)
  canonical_sha256  text NOT NULL,      -- sha256 of canonical_text(segment(texto)) — the gate
  vigencia          daterange GENERATED ALWAYS AS (daterange(desde, hasta, '[]')) STORED,
  UNIQUE (id_norma, desde),
  -- The bug a delta loader introduces, and the one that makes "text as of D"
  -- ambiguous. Let the database refuse it.
  EXCLUDE USING gist (id_norma WITH =, vigencia WITH &&)
);
CREATE INDEX IF NOT EXISTS version_vigencia_idx ON version USING gist (vigencia);

CREATE TABLE IF NOT EXISTS articulo (
  id           bigserial PRIMARY KEY,
  id_norma     integer NOT NULL REFERENCES norma ON DELETE CASCADE,
  slug         text NOT NULL,
  label        text NOT NULL,
  raw_heading  text NOT NULL,
  body         text NOT NULL,
  content_sha256  text NOT NULL,
  tsv          tsvector GENERATED ALWAYS AS (to_tsvector('spanish', body)) STORED,
  UNIQUE (id_norma, slug, content_sha256)
);
CREATE INDEX IF NOT EXISTS articulo_tsv_idx ON articulo USING gin (tsv);

CREATE TABLE IF NOT EXISTS articulo_span (
  articulo_id  bigint NOT NULL REFERENCES articulo ON DELETE CASCADE,
  desde        date NOT NULL,
  hasta        date,
  ord          integer NOT NULL,
  vigencia     daterange GENERATED ALWAYS AS (daterange(desde, hasta, '[]')) STORED,
  -- ord is in the key: one body may legitimately appear at two positions in a
  -- single version (deviates from spec §6.1's two-column key, which would
  -- collide in that case).
  PRIMARY KEY (articulo_id, desde, ord)
);
CREATE INDEX IF NOT EXISTS articulo_span_vigencia_idx ON articulo_span USING gist (vigencia);

-- One row per publication EVENT. `version` coalesces same-date events (87 real
-- normas have 2+ on one date; idNorma 1984 has three on 2023-04-10) so that
-- "the text as of date D" has exactly one answer. Every event survives here.
CREATE TABLE IF NOT EXISTS publication_event (
  id_norma    integer NOT NULL REFERENCES norma ON DELETE CASCADE,
  commit_sha  text NOT NULL,
  fecha       date NOT NULL,      -- real_date(), never the committer date
  causa_id    integer,
  subject     text,
  magnitude   integer,
  PRIMARY KEY (id_norma, commit_sha)
);
CREATE INDEX IF NOT EXISTS publication_event_norma_fecha_idx
  ON publication_event (id_norma, fecha);

CREATE TABLE IF NOT EXISTS modificacion (
  causa_id   integer NOT NULL,
  target_id  integer NOT NULL,
  fecha      date NOT NULL,
  commit_sha text,
  PRIMARY KEY (causa_id, target_id, fecha)
);

CREATE TABLE IF NOT EXISTS load_state (
  id               boolean PRIMARY KEY DEFAULT true CHECK (id),
  watermark        date NOT NULL,
  snapshot_version text NOT NULL,
  last_delta_seq   integer NOT NULL
);

-- ---------------------------------------------------------------------------
-- Analytics. Centralize collection; interpretation stays per-consumer.
-- No user dimension is ever collected: no IP, cookie, session id, fingerprint.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.event (
  ts           timestamptz NOT NULL DEFAULT now(),
  kind         text NOT NULL CHECK (kind IN ('search','result_click','cold_surface')),
  query_norm   text,
  id_norma     integer,
  tier         text CHECK (tier IN ('hot','cold')),
  result_count integer,
  clicked_rank integer
);
CREATE INDEX IF NOT EXISTS event_ts_idx ON analytics.event (ts);
CREATE INDEX IF NOT EXISTS event_kind_norma_idx ON analytics.event (kind, id_norma);

-- The only consumer that feeds the index policy.
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.norma_signal AS
  SELECT id_norma,
         SUM(CASE kind WHEN 'cold_surface' THEN 3
                       WHEN 'result_click' THEN 1
                       ELSE 0 END)::integer AS score
  FROM analytics.event
  WHERE id_norma IS NOT NULL
    AND ts >= now() - interval '90 days'
  GROUP BY id_norma;
CREATE UNIQUE INDEX IF NOT EXISTS norma_signal_pk ON analytics.norma_signal (id_norma);
