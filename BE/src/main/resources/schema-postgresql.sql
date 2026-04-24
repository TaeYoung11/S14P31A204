CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_projects_name_lower_trgm
    ON projects
    USING gin (lower(name) gin_trgm_ops)
    WHERE deleted_at IS NULL;
