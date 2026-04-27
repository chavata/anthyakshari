-- Songs table for admin-managed pool
CREATE TABLE IF NOT EXISTS songs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  language        text NOT NULL,
  title           text NOT NULL,
  movie           text,
  artist          text,
  release_year    int,

  spotify_track_id text UNIQUE,
  spotify_url     text,
  album_art_url   text,

  hint_1_url      text NOT NULL,
  hint_2_url      text NOT NULL,
  hint_3_url      text NOT NULL,
  hint_4_url      text NOT NULL,
  hint_5_url      text NOT NULL,

  clue_lyricist   text,
  clue_singers    text,
  clue_composer   text,

  used_date       date,

  created_at      timestamptz DEFAULT now(),
  uploaded_by     text
);

CREATE INDEX IF NOT EXISTS songs_pool ON songs (language, used_date);
