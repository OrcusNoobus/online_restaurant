CREATE TYPE "public"."coupon_type" AS ENUM('percent', 'fixed', 'free_delivery');--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" "coupon_type" NOT NULL,
	"value" integer,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code"),
	CONSTRAINT "coupons_value_by_type" CHECK (("coupons"."type" = 'percent' AND "coupons"."value" IS NOT NULL AND "coupons"."value" BETWEEN 1 AND 100) OR ("coupons"."type" = 'fixed' AND "coupons"."value" IS NOT NULL AND "coupons"."value" >= 1) OR ("coupons"."type" = 'free_delivery' AND "coupons"."value" IS NULL)),
	CONSTRAINT "coupons_window" CHECK ("coupons"."starts_at" IS NULL OR "coupons"."ends_at" IS NULL OR "coupons"."starts_at" < "coupons"."ends_at")
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_total_positive";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_total_is_sum";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "coupon_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "coupon_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_bani" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_non_negative" CHECK ("orders"."discount_bani" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_non_negative" CHECK ("orders"."total_bani" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_pairing" CHECK (("orders"."coupon_id" IS NULL AND "orders"."coupon_code" IS NULL AND "orders"."discount_bani" = 0) OR ("orders"."coupon_id" IS NOT NULL AND "orders"."coupon_code" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_is_sum" CHECK ("orders"."total_bani" = "orders"."subtotal_bani" + "orders"."sgr_bani" + "orders"."delivery_fee_bani" - "orders"."discount_bani");