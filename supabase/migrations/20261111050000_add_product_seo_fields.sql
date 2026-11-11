-- Keep SEO copy editable without changing pricing, products or existing RLS policies.
ALTER TABLE public.site_products ADD COLUMN IF NOT EXISTS seo_title text;
ALTER TABLE public.site_products ADD COLUMN IF NOT EXISTS seo_description text;
ALTER TABLE public.site_products ADD COLUMN IF NOT EXISTS search_keywords text[] NOT NULL DEFAULT ARRAY[]::text[];
