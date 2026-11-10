-- Store ordered images rendered inside the full product description.
-- Keep the legacy specs JSONB column intact for historical data.
ALTER TABLE public.site_products
  ADD COLUMN IF NOT EXISTS detail_image_paths jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.site_products.detail_image_paths IS
  'Ordered image paths for product description content, separate from gallery images';
