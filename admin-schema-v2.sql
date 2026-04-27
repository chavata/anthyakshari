-- Migration v2: rename clue columns + add structured metadata + scheduling
-- Run this AFTER admin-schema.sql

-- Rename clue columns (so naming reflects actual hint position, not type)
ALTER TABLE songs RENAME COLUMN clue_lyricist TO clue_hint_3;
ALTER TABLE songs RENAME COLUMN clue_singers  TO clue_hint_4;
ALTER TABLE songs RENAME COLUMN clue_composer TO clue_hint_5;

-- Structured metadata (for future contests/filtering)
ALTER TABLE songs ADD COLUMN IF NOT EXISTS lyricist        text;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS singers         text;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS composer        text;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS director        text;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS hero            text;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS heroine         text;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS tmdb_movie_id   int;

-- Scheduling
ALTER TABLE songs ADD COLUMN IF NOT EXISTS scheduled_date date;
CREATE INDEX IF NOT EXISTS songs_scheduled ON songs (language, scheduled_date);
