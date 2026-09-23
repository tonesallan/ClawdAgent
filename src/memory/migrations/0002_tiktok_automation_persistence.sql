CREATE TABLE "tiktok_action_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"provider" varchar(30),
	"result" jsonb,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiktok_action_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_key" varchar(100) DEFAULT 'default' NOT NULL,
	"action_type" varchar(40) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"daily_limit" integer,
	"hourly_limit" integer,
	"min_interval_seconds" integer,
	"max_interval_seconds" integer,
	"cooldown_seconds" integer,
	"allowed_hours" jsonb DEFAULT '[]'::jsonb,
	"allowed_weekdays" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiktok_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_key" varchar(100) DEFAULT 'default' NOT NULL,
	"type" varchar(40) NOT NULL,
	"target_key" varchar(250),
	"target_username" varchar(100),
	"target_display_name" varchar(200),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"execute_at" timestamp,
	"priority" integer DEFAULT 5 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"provider" varchar(30) DEFAULT 'android' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"result" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiktok_configuration" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiktok_user_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_key" varchar(100) DEFAULT 'default' NOT NULL,
	"target_key" varchar(250) NOT NULL,
	"username" varchar(100),
	"display_name" varchar(200),
	"relationship_state" varchar(30) DEFAULT 'unknown' NOT NULL,
	"follows_us" boolean,
	"followed_by_us" boolean DEFAULT false NOT NULL,
	"followed_by_us_at" timestamp,
	"follow_back_check_at" timestamp,
	"last_checked_at" timestamp,
	"protected" boolean DEFAULT false NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tiktok_action_history" ADD CONSTRAINT "tiktok_action_history_action_id_tiktok_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."tiktok_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tiktok_action_history_action" ON "tiktok_action_history" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "idx_tiktok_action_history_status" ON "tiktok_action_history" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tiktok_action_history_created" ON "tiktok_action_history" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tiktok_action_limits_account_type" ON "tiktok_action_limits" USING btree ("account_key","action_type");--> statement-breakpoint
CREATE INDEX "idx_tiktok_action_limits_enabled" ON "tiktok_action_limits" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_tiktok_actions_status" ON "tiktok_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tiktok_actions_execute_at" ON "tiktok_actions" USING btree ("execute_at");--> statement-breakpoint
CREATE INDEX "idx_tiktok_actions_type" ON "tiktok_actions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_tiktok_actions_account_status" ON "tiktok_actions" USING btree ("account_key","status");--> statement-breakpoint
CREATE INDEX "idx_tiktok_actions_target" ON "tiktok_actions" USING btree ("target_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tiktok_relationship_account_target" ON "tiktok_user_relationships" USING btree ("account_key","target_key");--> statement-breakpoint
CREATE INDEX "idx_tiktok_relationship_username" ON "tiktok_user_relationships" USING btree ("username");--> statement-breakpoint
CREATE INDEX "idx_tiktok_relationship_state" ON "tiktok_user_relationships" USING btree ("relationship_state");--> statement-breakpoint
CREATE INDEX "idx_tiktok_relationship_followback_check" ON "tiktok_user_relationships" USING btree ("follow_back_check_at");--> statement-breakpoint
CREATE INDEX "idx_tiktok_relationship_protected" ON "tiktok_user_relationships" USING btree ("protected");