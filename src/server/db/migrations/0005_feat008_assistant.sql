CREATE TYPE "public"."assistant_role" AS ENUM('user', 'assistant', 'tool');--> statement-breakpoint
CREATE TABLE "assistant_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_ip" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "assistant_role" NOT NULL,
	"content" jsonb NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversation_id_assistant_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_conversations_last_activity_idx" ON "assistant_conversations" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "assistant_messages_conversation_id_idx" ON "assistant_messages" USING btree ("conversation_id","id");