CREATE TABLE `claude_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`product_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`system` text NOT NULL,
	`prompt` text NOT NULL,
	`json_schema` text,
	`status` text NOT NULL,
	`answer` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`claimed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `claude_jobs_status_idx` ON `claude_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `claude_jobs_task_idx` ON `claude_jobs` (`task_id`);