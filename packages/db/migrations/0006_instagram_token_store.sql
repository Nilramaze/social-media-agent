ALTER TABLE "social_accounts" ADD COLUMN "access_token" text;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "access_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "access_token_refreshed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "token_error" text;