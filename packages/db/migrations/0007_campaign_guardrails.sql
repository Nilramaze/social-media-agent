ALTER TABLE "campaigns" ADD COLUMN "extra_instructions" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "banned_terms" jsonb DEFAULT '[]'::jsonb NOT NULL;