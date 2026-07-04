CREATE TABLE "delivery_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"fee_bani" integer NOT NULL,
	"free_from_bani" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "delivery_zones_slug_unique" UNIQUE("slug"),
	CONSTRAINT "delivery_zones_fee_non_negative" CHECK ("delivery_zones"."fee_bani" >= 0),
	CONSTRAINT "delivery_zones_free_from_non_negative" CHECK ("delivery_zones"."free_from_bani" >= 0)
);
