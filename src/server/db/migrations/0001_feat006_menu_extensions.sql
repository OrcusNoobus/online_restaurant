ALTER TABLE "topping_groups" ADD COLUMN "required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "topping_groups" ADD COLUMN "display_type" text DEFAULT 'checkbox' NOT NULL;--> statement-breakpoint
ALTER TABLE "topping_groups" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "toppings" ADD COLUMN "sgr_deposit_bani" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_name_unique" UNIQUE NULLS NOT DISTINCT("product_id","name");--> statement-breakpoint
ALTER TABLE "topping_groups" ADD CONSTRAINT "topping_groups_display_type_valid" CHECK ("topping_groups"."display_type" IN ('radio', 'checkbox'));--> statement-breakpoint
ALTER TABLE "toppings" ADD CONSTRAINT "toppings_sgr_deposit_non_negative" CHECK ("toppings"."sgr_deposit_bani" >= 0);