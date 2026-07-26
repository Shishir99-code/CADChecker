import { sql } from "@vercel/postgres";

export interface StoredCheck {
  id: number;
  onshape_user_id: string;
  onshape_team_id: string | null;
  document_id: string;
  workspace_id: string;
  element_id: string;
  passed: boolean;
  violations: unknown;
  check_metadata: unknown | null;
  created_at: string;
}

export interface CheckToStore {
  onshape_user_id: string;
  onshape_team_id: string | null;
  document_id: string;
  workspace_id: string;
  element_id: string;
  passed: boolean;
  violations: unknown;
  check_metadata?: unknown;
}

/**
 * Store a single check result in the database.
 */
export async function storeCheck(check: CheckToStore): Promise<StoredCheck> {
  const result = await sql<StoredCheck>`
    INSERT INTO checks (
      onshape_user_id,
      onshape_team_id,
      document_id,
      workspace_id,
      element_id,
      passed,
      violations,
      check_metadata
    ) VALUES (
      ${check.onshape_user_id},
      ${check.onshape_team_id},
      ${check.document_id},
      ${check.workspace_id},
      ${check.element_id},
      ${check.passed},
      ${JSON.stringify(check.violations)},
      ${check.check_metadata ? JSON.stringify(check.check_metadata) : null}
    )
    RETURNING *
  `;

  return result.rows[0];
}

/**
 * Fetch the last N checks for a given document.
 */
export async function getChecksForDocument(
  documentId: string,
  limit: number = 10,
): Promise<StoredCheck[]> {
  const result = await sql<StoredCheck>`
    SELECT * FROM checks
    WHERE document_id = ${documentId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return result.rows;
}

/**
 * Fetch the last N checks for a given Onshape user.
 */
export async function getChecksForUser(
  userId: string,
  limit: number = 20,
): Promise<StoredCheck[]> {
  const result = await sql<StoredCheck>`
    SELECT * FROM checks
    WHERE onshape_user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return result.rows;
}

/**
 * Initialize database schema (run once on first deploy).
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // Create checks table
    await sql`
      CREATE TABLE IF NOT EXISTS checks (
        id SERIAL PRIMARY KEY,
        onshape_user_id VARCHAR(255) NOT NULL,
        onshape_team_id VARCHAR(255),
        document_id VARCHAR(255) NOT NULL,
        workspace_id VARCHAR(255) NOT NULL,
        element_id VARCHAR(255) NOT NULL,
        passed BOOLEAN NOT NULL,
        violations JSONB NOT NULL DEFAULT '[]'::jsonb,
        check_metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Create teams table
    await sql`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        onshape_team_id VARCHAR(255) UNIQUE NOT NULL,
        frc_team_number INTEGER,
        team_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Create indices for fast queries
    await sql`
      CREATE INDEX IF NOT EXISTS idx_checks_user_created
      ON checks(onshape_user_id, created_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_checks_document_created
      ON checks(document_id, created_at DESC)
    `;

    console.log("Database schema initialized successfully");
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  }
}
