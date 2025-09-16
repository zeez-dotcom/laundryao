-- Add Arabic/localized fields to branches
ALTER TABLE "branches"
  ADD COLUMN IF NOT EXISTS "name_ar" text,
  ADD COLUMN IF NOT EXISTS "address_ar" text,
  ADD COLUMN IF NOT EXISTS "tagline_ar" text,
  ADD COLUMN IF NOT EXISTS "whatsapp_qr_url" text;

-- Add Arabic/localized fields to branch_customizations
ALTER TABLE "branch_customizations"
  ADD COLUMN IF NOT EXISTS "header_text_ar" text,
  ADD COLUMN IF NOT EXISTS "sub_header_text_ar" text,
  ADD COLUMN IF NOT EXISTS "footer_text_ar" text,
  ADD COLUMN IF NOT EXISTS "address_ar" text,
  ADD COLUMN IF NOT EXISTS "return_policy_ar" text,
  ADD COLUMN IF NOT EXISTS "delivery_policy" text,
  ADD COLUMN IF NOT EXISTS "delivery_policy_ar" text,
  ADD COLUMN IF NOT EXISTS "compensation_notice_en" text,
  ADD COLUMN IF NOT EXISTS "compensation_notice_ar" text;

-- Customer dashboard settings
CREATE TABLE IF NOT EXISTS "customer_dashboard_settings" (
  "branch_id" uuid PRIMARY KEY REFERENCES "branches"("id"),
  "hero_title_en" text,
  "hero_title_ar" text,
  "hero_subtitle_en" text,
  "hero_subtitle_ar" text,
  "featured_message_en" text,
  "featured_message_ar" text,
  "show_packages" boolean DEFAULT true NOT NULL,
  "show_orders" boolean DEFAULT true NOT NULL,
  "updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Ads and analytics tables
CREATE TABLE IF NOT EXISTS "branch_ads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "title_en" text NOT NULL,
  "title_ar" text,
  "image_url" text NOT NULL,
  "target_url" text,
  "placement" text DEFAULT 'dashboard_top' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "starts_at" timestamptz,
  "ends_at" timestamptz,
  "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "ad_impressions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ad_id" uuid NOT NULL REFERENCES "branch_ads"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "customer_id" uuid REFERENCES "customers"("id"),
  "city_id" uuid REFERENCES "cities"("id"),
  "governorate_id" uuid REFERENCES "cities"("id"),
  "lat" numeric(9,6),
  "lng" numeric(9,6),
  "language" text,
  "user_agent" text,
  "referrer" text,
  "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "ad_clicks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ad_id" uuid NOT NULL REFERENCES "branch_ads"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "customer_id" uuid REFERENCES "customers"("id"),
  "city_id" uuid REFERENCES "cities"("id"),
  "governorate_id" uuid REFERENCES "cities"("id"),
  "lat" numeric(9,6),
  "lng" numeric(9,6),
  "language" text,
  "user_agent" text,
  "referrer" text,
  "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);
