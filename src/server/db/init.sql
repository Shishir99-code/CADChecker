-- Create checks table to store all legality check runs
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
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_created (onshape_user_id, created_at DESC),
  INDEX idx_document_created (document_id, created_at DESC)
);

-- Create teams table to map Onshape team IDs to FRC team numbers (optional)
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  onshape_team_id VARCHAR(255) UNIQUE NOT NULL,
  frc_team_number INTEGER,
  team_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
