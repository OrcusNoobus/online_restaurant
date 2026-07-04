CREATE TYPE "public"."order_mode" AS ENUM('delivery', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('new', 'accepted', 'in_delivery', 'completed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card_delivery', 'card_restaurant');--> statement-breakpoint
CREATE TABLE "order_item_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" integer NOT NULL,
	"topping_id" integer NOT NULL,
	"group_name" text NOT NULL,
	"topping_name" text NOT NULL,
	"price_bani" integer NOT NULL,
	"sgr_deposit_bani" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "order_item_options_price_non_negative" CHECK ("order_item_options"."price_bani" >= 0),
	CONSTRAINT "order_item_options_sgr_non_negative" CHECK ("order_item_options"."sgr_deposit_bani" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"variant_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"variant_name" text,
	"unit_price_bani" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_bani" integer NOT NULL,
	CONSTRAINT "order_items_unit_price_positive" CHECK ("order_items"."unit_price_bani" > 0),
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_line_total_positive" CHECK ("order_items"."line_total_bani" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"mode" "order_mode" NOT NULL,
	"status" "order_status" DEFAULT 'new' NOT NULL,
	"customer_first_name" text NOT NULL,
	"customer_last_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"zone_id" integer,
	"address_street" text,
	"notes" text,
	"scheduled_for" timestamp with time zone,
	"estimate_minutes" integer,
	"payment_method" "payment_method" NOT NULL,
	"subtotal_bani" integer NOT NULL,
	"sgr_bani" integer DEFAULT 0 NOT NULL,
	"delivery_fee_bani" integer DEFAULT 0 NOT NULL,
	"total_bani" integer NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"client_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_subtotal_non_negative" CHECK ("orders"."subtotal_bani" >= 0),
	CONSTRAINT "orders_sgr_non_negative" CHECK ("orders"."sgr_bani" >= 0),
	CONSTRAINT "orders_fee_non_negative" CHECK ("orders"."delivery_fee_bani" >= 0),
	CONSTRAINT "orders_total_positive" CHECK ("orders"."total_bani" > 0),
	CONSTRAINT "orders_total_is_sum" CHECK ("orders"."total_bani" = "orders"."subtotal_bani" + "orders"."sgr_bani" + "orders"."delivery_fee_bani"),
	CONSTRAINT "orders_delivery_has_zone_and_address" CHECK ("orders"."mode" = 'pickup' OR ("orders"."zone_id" IS NOT NULL AND "orders"."address_street" IS NOT NULL)),
	CONSTRAINT "orders_pickup_has_no_fee" CHECK ("orders"."mode" = 'delivery' OR "orders"."delivery_fee_bani" = 0)
);
--> statement-breakpoint
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_topping_id_toppings_id_fk" FOREIGN KEY ("topping_id") REFERENCES "public"."toppings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE restrict ON UPDATE no action;