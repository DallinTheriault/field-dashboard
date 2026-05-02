/**
 * Tag types — client-safe. No server-only imports.
 */

export type Tag = {
  id: number;
  client_id: number;
  name: string;
  color_hex: string;
  use_count: number;
  created_at: string;
  created_by: string | null;
};

export type TagWithUseCount = Tag;
