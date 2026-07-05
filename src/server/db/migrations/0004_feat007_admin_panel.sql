CREATE TYPE "public"."staff_role" AS ENUM('admin', 'staff');--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'ready_for_pickup' BEFORE 'completed';--> statement-breakpoint
CREATE TABLE "order_status_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"from_status" "order_status" NOT NULL,
	"to_status" "order_status" NOT NULL,
	"reason" text,
	"staff_user_id" integer NOT NULL,
	"undo_of_event_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"open_minutes" integer NOT NULL,
	"close_minutes" integer NOT NULL,
	"earliest_fulfillment_minutes" integer NOT NULL,
	"delivery_estimate_minutes" integer NOT NULL,
	"pickup_estimate_options_minutes" integer[] NOT NULL,
	"catalog_protected_since" timestamp with time zone,
	"zones_protected_since" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_settings_single_row" CHECK ("restaurant_settings"."id" = 1),
	CONSTRAINT "restaurant_settings_hours_valid" CHECK ("restaurant_settings"."open_minutes" >= 0 AND "restaurant_settings"."close_minutes" <= 1440 AND "restaurant_settings"."open_minutes" < "restaurant_settings"."close_minutes"),
	CONSTRAINT "restaurant_settings_earliest_after_open" CHECK ("restaurant_settings"."earliest_fulfillment_minutes" >= "restaurant_settings"."open_minutes"),
	CONSTRAINT "restaurant_settings_delivery_estimate_positive" CHECK ("restaurant_settings"."delivery_estimate_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"staff_user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "ingredients" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "allergens" text;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_undo_of_event_id_order_status_events_id_fk" FOREIGN KEY ("undo_of_event_id") REFERENCES "public"."order_status_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "restaurant_settings"
	("id", "open_minutes", "close_minutes", "earliest_fulfillment_minutes", "delivery_estimate_minutes", "pickup_estimate_options_minutes")
VALUES (1, 660, 1350, 690, 60, '{15,25}');