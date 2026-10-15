CREATE TABLE `achievements` (
	`id` text NOT NULL,
	`demo` integer DEFAULT false NOT NULL,
	`unlocked_at` text NOT NULL,
	PRIMARY KEY(`id`, `demo`)
);
--> statement-breakpoint
CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent` text,
	`room` text,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_agent_idx` ON `activity` (`agent`,`id`);--> statement-breakpoint
CREATE INDEX `activity_room_idx` ON `activity` (`room`,`id`);--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`status` text NOT NULL,
	`note` text,
	`demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`amount` integer DEFAULT 1 NOT NULL,
	`demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_type_idx` ON `events` (`type`,`created_at`);--> statement-breakpoint
CREATE TABLE `handoffs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` text,
	`from_room` text NOT NULL,
	`to_room` text NOT NULL,
	`demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`amount_pence` integer NOT NULL,
	`non_gbp` integer DEFAULT false NOT NULL,
	`product_id` text,
	`sale_id` text,
	`demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_date_idx` ON `ledger` (`date`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `owner` (
	`id` integer PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL,
	`iterations` integer NOT NULL,
	`session_version` integer DEFAULT 1 NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`niche` text NOT NULL,
	`stage` text NOT NULL,
	`seed` integer NOT NULL,
	`price_pence` integer,
	`data` text DEFAULT '{}' NOT NULL,
	`demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quest_claims` (
	`quest_id` text NOT NULL,
	`period_key` text NOT NULL,
	`demo` integer DEFAULT false NOT NULL,
	`claimed_at` text NOT NULL,
	PRIMARY KEY(`quest_id`, `period_key`, `demo`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text,
	`room` text NOT NULL,
	`agent` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`needs_approval` integer DEFAULT true NOT NULL,
	`input` text DEFAULT '{}' NOT NULL,
	`output` text,
	`note` text,
	`error` text,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`started_at` text,
	`finished_at` text,
	`demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_state_idx` ON `tasks` (`state`);--> statement-breakpoint
CREATE INDEX `tasks_room_idx` ON `tasks` (`room`,`state`);--> statement-breakpoint
CREATE TABLE `vault` (
	`provider` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`last4` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `xp_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
