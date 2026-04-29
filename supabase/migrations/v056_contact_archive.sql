-- v0.5.6 — Soft-delete on contacts (mirrors jobs pattern from v0.4.8)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_contacts_archived_at
  ON contacts (archived_at)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN contacts.archived_at IS
  'Soft-delete timestamp. NULL = visible. Set = hidden from default views. Jobs and SMS threads remain intact for record-keeping.';
