# Cloudflare R2 product image migration — 2026-10-02

## Scope

Migrated only the three images referenced by the published product `ดอกตัด Compression 2 คม` (`90978f50-098b-425b-b74e-32e30bf6f15e`). Supabase Auth, customer/profile data, PostgreSQL schema, Marketplace media, profile media, and 3D models were not changed.

The original objects remain in the Supabase Storage bucket `site-products`. Nothing was deleted, so rollback only requires restoring the original database paths.

## Path manifest

| Record | Original Supabase path | Current database path |
| --- | --- | --- |
| Product cover | `covers/1790870020988-d9s8y9u344b.png` | `r2:product-images/covers/2026/10/90978f50-098b-425b-b74e-32e30bf6f15e.png` |
| Variant `659a0289-db00-4aff-874b-571ab5dae175` | `variants/1790870058816-czid5ck6nxl.png` | `r2:product-images/variants/2026/10/659a0289-db00-4aff-874b-571ab5dae175.png` |
| Variant `a827489a-3e1e-4704-923e-ad5a5fa8b2e9` | `variants/1790870046984-ct2dj8jjzyb.png` | `r2:product-images/variants/2026/10/a827489a-3e1e-4704-923e-ad5a5fa8b2e9.png` |

Public R2 URLs use `https://storage.apcncdiy.com/<object-key>`.

## Verification

- GitHub commit containing the dual-source reader and Worker API: `7811b06`.
- Cloudflare production deployment created at `2026-10-02T03:00:39Z`.
- All three R2 URLs returned HTTP 200 with `image/png`.
- Downloaded R2 copies matched the source object MD5 values.
- The production product-detail page rendered the cover and both variant images.
- The unauthenticated upload endpoint returned HTTP 401.

## Rollback SQL

Run only if this migration must be reverted:

```sql
begin;

update public.site_products
set cover_path = 'covers/1790870020988-d9s8y9u344b.png',
    updated_at = now()
where id = '90978f50-098b-425b-b74e-32e30bf6f15e'
  and cover_path = 'r2:product-images/covers/2026/10/90978f50-098b-425b-b74e-32e30bf6f15e.png';

update public.site_product_variants
set image_path = 'variants/1790870058816-czid5ck6nxl.png',
    updated_at = now()
where id = '659a0289-db00-4aff-874b-571ab5dae175'
  and image_path = 'r2:product-images/variants/2026/10/659a0289-db00-4aff-874b-571ab5dae175.png';

update public.site_product_variants
set image_path = 'variants/1790870046984-ct2dj8jjzyb.png',
    updated_at = now()
where id = 'a827489a-3e1e-4704-923e-ad5a5fa8b2e9'
  and image_path = 'r2:product-images/variants/2026/10/a827489a-3e1e-4704-923e-ad5a5fa8b2e9.png';

commit;
```

Do not delete the R2 objects during a database rollback. Keeping both copies makes a later forward migration safe.
