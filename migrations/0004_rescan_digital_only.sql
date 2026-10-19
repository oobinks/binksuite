-- Radar now reads digital listings only (no posters or framed prints), so re-read every niche soon.
UPDATE trend_niches SET last_scanned = '2000-01-01T00:00:00.000Z' WHERE source = 'etsy';
