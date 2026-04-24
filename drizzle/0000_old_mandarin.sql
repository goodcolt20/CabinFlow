CREATE TABLE `daily_summaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`summary_date` text NOT NULL,
	`product_id` integer NOT NULL,
	`total_prepped` real DEFAULT 0 NOT NULL,
	`total_sold` real DEFAULT 0 NOT NULL,
	`total_waste` real DEFAULT 0 NOT NULL,
	`closing_stock` real DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `prep_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`date_prepped` text NOT NULL,
	`quantity_prepped` real NOT NULL,
	`quantity_remaining` real NOT NULL,
	`shelf_life_days` integer NOT NULL,
	`expiry_date` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`unit` text DEFAULT 'portions' NOT NULL,
	`category` text DEFAULT 'uncategorized' NOT NULL,
	`default_shelf_life_days` integer,
	`created_at` text DEFAULT (date('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sales_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`sale_date` text NOT NULL,
	`quantity_sold` real NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`external_ref` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
