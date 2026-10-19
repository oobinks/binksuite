-- Owner asked for a £1.50 minimum profit per sale (was the £2.50 default), so prices can undercut cheaper niches.
UPDATE kv SET value = json_set(value, '$.minProfitPence', 150) WHERE key = 'settings' AND json_extract(value, '$.minProfitPence') = 250;--> statement-breakpoint
DELETE FROM kv WHERE key = 'gameCache';
