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

CREATE INDEX IF NOT EXISTS idx_jobs_project_type_created_at
    ON jobs (project_id, job_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifacts_project_job_type_created_at
    ON artifacts (project_id, job_id, artifact_type, created_at DESC);
