-- Add Tom Tennis Padel Burgas
INSERT INTO clubs (name, city, address)
SELECT 'Tom Tennis Padel Burgas', 'Бургас', 'tom.tennis.club'
WHERE NOT EXISTS (
  SELECT 1 FROM clubs WHERE name = 'Tom Tennis Padel Burgas'
);
