CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS jobs (
    job_id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    requested_by UUID,
    source_scene_state_id UUID,
    source_revision_id UUID,
    source_scene_type VARCHAR(50),
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    request_payload JSONB,
    result_payload JSONB,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    CONSTRAINT fk_jobs_project
        FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

ALTER TABLE IF EXISTS jobs
    ADD COLUMN IF NOT EXISTS requested_by UUID;
ALTER TABLE IF EXISTS jobs
    ADD COLUMN IF NOT EXISTS source_scene_state_id UUID;
ALTER TABLE IF EXISTS jobs
    ADD COLUMN IF NOT EXISTS source_revision_id UUID;
ALTER TABLE IF EXISTS jobs
    ADD COLUMN IF NOT EXISTS source_scene_type VARCHAR(50);
ALTER TABLE IF EXISTS jobs
    ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS jobs
    ADD COLUMN IF NOT EXISTS result_payload JSONB;
ALTER TABLE IF EXISTS jobs
    ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE IF EXISTS jobs
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS artifacts (
    artifact_id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    revision_id UUID,
    job_id UUID NOT NULL,
    artifact_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255),
    mime_type VARCHAR(100),
    storage_url VARCHAR(2048) NOT NULL,
    metadata_json JSONB,
    created_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_artifacts_project
        FOREIGN KEY (project_id) REFERENCES projects(project_id),
    CONSTRAINT fk_artifacts_job
        FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);

ALTER TABLE IF EXISTS artifacts
    ADD COLUMN IF NOT EXISTS revision_id UUID;
ALTER TABLE IF EXISTS artifacts
    ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
ALTER TABLE IF EXISTS artifacts
    ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);
ALTER TABLE IF EXISTS artifacts
    ADD COLUMN IF NOT EXISTS metadata_json JSONB;

CREATE TABLE IF NOT EXISTS job_steps (
    job_step_id UUID PRIMARY KEY,
    job_id UUID NOT NULL,
    step_no INTEGER NOT NULL,
    worker_type VARCHAR(50) NOT NULL,
    command_routing_key VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    input_payload JSONB,
    output_payload JSONB,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    CONSTRAINT fk_job_steps_job
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

ALTER TABLE IF EXISTS comments
    ADD COLUMN IF NOT EXISTS status VARCHAR(20);

UPDATE comments
SET status = 'OPEN'
WHERE status IS NULL;

ALTER TABLE IF EXISTS comments
    ALTER COLUMN status SET DEFAULT 'OPEN';

ALTER TABLE IF EXISTS comments
    ALTER COLUMN status SET NOT NULL;

ALTER TABLE IF EXISTS comments
    ADD COLUMN IF NOT EXISTS resolved_by_user_id UUID;

ALTER TABLE IF EXISTS comments
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;

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

CREATE TABLE IF NOT EXISTS project_pin_read_states (
    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    last_read_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_pin_read_states_user
    ON project_pin_read_states (user_id);

CREATE INDEX IF NOT EXISTS idx_project_pin_read_states_last_read_at
    ON project_pin_read_states (last_read_at);

CREATE INDEX IF NOT EXISTS idx_jobs_project_type_created_at
    ON jobs (project_id, job_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifacts_project_job_type_created_at
    ON artifacts (project_id, job_id, artifact_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_steps_job_step_no
    ON job_steps (job_id, step_no);

CREATE TABLE IF NOT EXISTS project_workspaces (
    project_id UUID PRIMARY KEY,
    phase_status VARCHAR(30) NOT NULL,
    bubble_snapshot_json JSONB,
    ifc_storage_url VARCHAR(2048),
    current_revision VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT fk_project_workspaces_project
        FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_workspaces_phase_status
    ON project_workspaces (phase_status);
