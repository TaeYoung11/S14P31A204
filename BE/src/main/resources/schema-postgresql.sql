CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS jobs (
    job_id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    request_payload JSONB,
    created_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP,
    CONSTRAINT fk_jobs_project
        FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE TABLE IF NOT EXISTS artifacts (
    artifact_id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    job_id UUID NOT NULL,
    artifact_type VARCHAR(50) NOT NULL,
    storage_url VARCHAR(2048) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_artifacts_project
        FOREIGN KEY (project_id) REFERENCES projects(project_id),
    CONSTRAINT fk_artifacts_job
        FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);

CREATE INDEX IF NOT EXISTS idx_projects_name_lower_trgm
    ON projects
    USING gin (lower(name) gin_trgm_ops)
    WHERE deleted_at IS NULL;

ALTER TABLE IF EXISTS project_pins
    ADD COLUMN IF NOT EXISTS version BIGINT;

UPDATE project_pins
SET version = 0
WHERE version IS NULL;

ALTER TABLE IF EXISTS project_pins
    ALTER COLUMN version SET DEFAULT 0;

ALTER TABLE IF EXISTS project_pins
    ALTER COLUMN version SET NOT NULL;

CREATE TABLE IF NOT EXISTS pin_comment_read_states (
    pin_id UUID NOT NULL,
    user_id UUID NOT NULL,
    last_read_comment_id UUID NULL,
    last_read_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (pin_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pin_comment_read_states_user
    ON pin_comment_read_states (user_id);

CREATE INDEX IF NOT EXISTS idx_pin_comment_read_states_last_read_at
    ON pin_comment_read_states (last_read_at);

CREATE INDEX IF NOT EXISTS idx_jobs_project_type_created_at
    ON jobs (project_id, job_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifacts_project_job_type_created_at
    ON artifacts (project_id, job_id, artifact_type, created_at DESC);
