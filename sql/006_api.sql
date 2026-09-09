-- Public REST API: keys and usage.
--
-- Keys are stored as SHA-256 digests. The plaintext is returned once by
-- issue_api_key and is unrecoverable afterwards, so a database leak yields no
-- usable credentials.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS api_key (
  id         bigserial PRIMARY KEY,
  key_hash   text NOT NULL UNIQUE,
  -- Display only, so a human can tell keys apart in a listing. Never
  -- sufficient to authenticate with.
  key_prefix text NOT NULL,
  label      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS api_usage (
  id          bigserial PRIMARY KEY,
  key_id      bigint NOT NULL REFERENCES api_key (id) ON DELETE CASCADE,
  ts          timestamptz NOT NULL DEFAULT now(),
  -- The route TEMPLATE ('/v1/normas/{idNorma}'), never the concrete path.
  -- Storing '/v1/normas/29994' would build a per-caller record of which laws
  -- someone read — the same category of data as the query text this design
  -- deliberately does not keep.
  endpoint    text NOT NULL,
  status      int NOT NULL,
  duration_ms int NOT NULL
);

CREATE INDEX IF NOT EXISTS api_usage_key_ts_idx ON api_usage (key_id, ts DESC);
CREATE INDEX IF NOT EXISTS api_usage_ts_idx     ON api_usage (ts);

-- Returns the plaintext key ONCE. There is no way to recover it later.
CREATE OR REPLACE FUNCTION issue_api_key(p_label text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  raw   text;
  token text;
BEGIN
  IF p_label IS NULL OR btrim(p_label) = '' THEN
    RAISE EXCEPTION 'label is required';
  END IF;
  -- 24 bytes of CSPRNG, base64url. translate() strips the base64 characters
  -- that are unsafe in a URL or an Authorization header.
  raw   := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
  token := 'lc_live_' || raw;
  INSERT INTO api_key (key_hash, key_prefix, label)
  VALUES (encode(digest(token, 'sha256'), 'hex'), left(token, 16), btrim(p_label));
  RETURN token;
END
$$;

CREATE OR REPLACE FUNCTION revoke_api_key(p_prefix text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  UPDATE api_key SET revoked_at = now()
   WHERE key_prefix = p_prefix AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END
$$;

-- Mirrors the 90-day prune retier.py already applies to analytics.event.
CREATE OR REPLACE FUNCTION prune_api_usage(p_days int DEFAULT 90)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  DELETE FROM api_usage WHERE ts < now() - make_interval(days => p_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;
