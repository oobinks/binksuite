CREATE TABLE `trend_niches` (
	`keyword` text PRIMARY KEY NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`origin` text DEFAULT 'seed' NOT NULL,
	`source` text,
	`last_scanned` text,
	`total_listings` integer,
	`median_price_pence` integer,
	`low_price_pence` integer,
	`favs_per_day` real,
	`new_listings_30d` integer,
	`score` real DEFAULT 0 NOT NULL,
	`note` text,
	`last_suggested` text
);
--> statement-breakpoint
CREATE INDEX `trend_score_idx` ON `trend_niches` (`score`);