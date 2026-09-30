-- Typo-tolerant product search (PRD §6.3): "manchster" finds Manchester United.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Product_search_trgm_idx" ON "Product"
  USING gin ((lower("title" || ' ' || "brand" || ' ' || coalesce("team", ''))) gin_trgm_ops);
