CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_topping_groups" (
	"product_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	CONSTRAINT "product_topping_groups_product_id_group_id_pk" PRIMARY KEY("product_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" text,
	"price_bani" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_variants_price_positive" CHECK ("product_variants"."price_bani" > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "topping_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topping_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"topping_id" integer NOT NULL,
	"size_name" text,
	"price_bani" integer NOT NULL,
	CONSTRAINT "topping_prices_topping_size_unique" UNIQUE NULLS NOT DISTINCT("topping_id","size_name"),
	CONSTRAINT "topping_prices_price_non_negative" CHECK ("topping_prices"."price_bani" >= 0)
);
--> statement-breakpoint
CREATE TABLE "toppings" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_topping_groups" ADD CONSTRAINT "product_topping_groups_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_topping_groups" ADD CONSTRAINT "product_topping_groups_group_id_topping_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."topping_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topping_prices" ADD CONSTRAINT "topping_prices_topping_id_toppings_id_fk" FOREIGN KEY ("topping_id") REFERENCES "public"."toppings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toppings" ADD CONSTRAINT "toppings_group_id_topping_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."topping_groups"("id") ON DELETE cascade ON UPDATE no action;