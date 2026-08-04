-- The line under the name on the "Every Occasion, Every Person" cards.
ALTER TABLE "Tag" ADD COLUMN IF NOT EXISTS "summary" TEXT;

-- Carried over from OccasionSection.tsx so the cards read the same the moment
-- they go live. Matched on slug: a shop that has renamed a tag keeps its own
-- wording, and one that has not gets the line it already shows.
UPDATE "Tag" SET "summary" = v.summary FROM (VALUES
  ('birthday',      'Make their day unforgettable'),
  ('anniversary',   'Celebrate your story'),
  ('love-romance',  'When words aren''t enough'),
  ('just-because',  'No reason needed'),
  ('mothers-day',   'For the first love of your life'),
  ('corporate',     'Impress every client'),
  ('her',           'She deserves the world'),
  ('him',           'Thoughtful, not typical'),
  ('parents',       'A thank you they will keep'),
  ('friend',        'For the one who always shows up')
) AS v(slug, summary)
WHERE "Tag".slug = v.slug AND "Tag"."summary" IS NULL;
