-- Owner asked for 5 ideas a day (they now pick one of them to make each day).
UPDATE kv SET value = json_set(value, '$.radar.dailyIdeas', 5) WHERE key = 'settings' AND json_extract(value, '$.radar.dailyIdeas') IS NOT NULL;
