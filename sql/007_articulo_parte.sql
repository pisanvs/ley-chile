-- LeyChile idParte per article, from the `<!-- parte:N -->` line that
-- render_texto.py writes under each article heading. Stable across versions
-- while the article is amended; the reader keys annotations by it.
-- Nullable: text rendered without LeyChile's structure tree has none.
ALTER TABLE articulo ADD COLUMN IF NOT EXISTS parte bigint;
