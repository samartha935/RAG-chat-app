CREATE TABLE "chat_rate_limit_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"minute_bucket_start" timestamp with time zone NOT NULL,
	"minute_count" integer DEFAULT 0 NOT NULL,
	"day_utc" text NOT NULL,
	"day_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_rate_limit_state" ADD CONSTRAINT "chat_rate_limit_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;