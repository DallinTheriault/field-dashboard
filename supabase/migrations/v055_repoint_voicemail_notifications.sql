-- v0.5.5 — Repoint stale voicemail notification URLs.
--
-- Pre-v0.5.0, voicemail notifications had link_url='/app/messages/{id}' where
-- {id} was the messages table primary key. v0.5.0 repurposed /app/messages
-- for SMS threads, breaking those links. This migration rewrites them to
-- the new dedicated route at /app/calls/voicemail/{id}.
--
-- WF10 doesn't actually emit /app/messages-style URLs (it uses
-- /app/calls/{summary_id} via the summaryId fallback), so this is one-shot
-- cleanup, not an ongoing concern.

BEGIN;

UPDATE notifications
SET link_url = '/app/calls/voicemail/' || COALESCE(source_message_id, 0)::text
WHERE kind = 'message_left'
  AND link_url LIKE '/app/messages/%';

COMMIT;
