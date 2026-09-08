ALTER TABLE "campaigns" ADD COLUMN "auto_replenish" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "auto_replenish_buffer_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "last_replenished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "replenish_error" text;