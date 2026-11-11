-- Flat THB 60 shipping for physical product orders below THB 2,500 (subtotal before VAT).
-- No changes to membership-order RPC.
UPDATE public.shop_settings SET shipping_fee = 60 WHERE singleton = true;

CREATE OR REPLACE FUNCTION public.create_guest_shop_order(p_customer jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_order_id uuid := gen_random_uuid();
  v_order_no text := 'AP' || to_char(clock_timestamp(),'YYMMDD') || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_token_hash text := encode(digest(v_token, 'sha256'), 'hex');
  v_name text := btrim(coalesce(p_customer->>'name',''));
  v_phone text := btrim(coalesce(p_customer->>'phone',''));
  v_email text := nullif(btrim(coalesce(p_customer->>'email','')), '');
  v_address text := btrim(coalesce(p_customer->>'address',''));
  v_note text := left(btrim(coalesce(p_customer->>'note','')), 1000);
  v_tax_requested boolean := coalesce((p_customer->>'tax_invoice_requested')::boolean,false);
  v_tax_name text := left(btrim(coalesce(p_customer->>'tax_invoice_name','')),160);
  v_tax_id text := btrim(coalesce(p_customer->>'tax_invoice_tax_id',''));
  v_tax_branch text := left(btrim(coalesce(p_customer->>'tax_invoice_branch','')),80);
  v_tax_address text := left(btrim(coalesce(p_customer->>'tax_invoice_address','')),1500);
  v_tax_email text := left(btrim(coalesce(p_customer->>'tax_invoice_email','')),254);
  v_vat numeric(12,2) := 0;
  v_subtotal numeric(12,2) := 0;
  v_shipping numeric(12,2) := 0;
  v_total numeric(12,2);
  v_minutes integer := 60;
  j jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_qty integer;
  p public.site_products%rowtype;
  v public.site_product_variants%rowtype;
  v_has_variants boolean;
  v_price numeric(12,2);
  v_line numeric(12,2);
  v_variant_name text;
  v_image text;
  v_reserved boolean;
begin
  if v_tax_requested then
    if length(v_tax_name) < 2 or length(v_tax_address) < 5 or (v_tax_id <> '' and v_tax_id !~ '^[0-9]{13}$') then
      raise exception 'invalid_tax_invoice_details';
    end if;
  else
    v_tax_name := null; v_tax_id := null; v_tax_branch := null; v_tax_address := null; v_tax_email := null;
  end if;
  perform public.shop_release_expired_orders();

  if length(v_name) < 2 or length(v_name) > 160 then
    raise exception 'invalid_customer_name';
  end if;
  if length(v_phone) < 7 or length(v_phone) > 30 then
    raise exception 'invalid_phone';
  end if;
  if length(v_address) < 5 or length(v_address) > 1500 then
    raise exception 'invalid_shipping_address';
  end if;
  if v_email is not null and length(v_email) > 254 then
    raise exception 'invalid_email';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
    raise exception 'invalid_items';
  end if;

  select shipping_fee, reservation_minutes
    into v_shipping, v_minutes
    from public.shop_settings
   where singleton = true;

  v_shipping := coalesce(v_shipping, 0);
  v_minutes := coalesce(v_minutes, 60);

  insert into public.shop_orders(
    id, order_no, user_id, public_token_hash,
    customer_name, phone, email, shipping_address, customer_note,
    subtotal, shipping_fee, total, reservation_expires_at, vat_rate, vat_amount, tax_invoice_requested, tax_invoice_name, tax_invoice_tax_id, tax_invoice_branch, tax_invoice_address, tax_invoice_email
  ) values (
    v_order_id, v_order_no, auth.uid(), v_token_hash,
    v_name, v_phone, v_email, v_address, v_note,
    0, v_shipping, v_shipping, now() + make_interval(mins => v_minutes), 7, 0, v_tax_requested, v_tax_name, v_tax_id, v_tax_branch, v_tax_address, v_tax_email
  );

  for j in select * from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (j->>'product_id')::uuid;
    exception when others then
      raise exception 'invalid_product_id';
    end;
    begin
      v_variant_id := nullif(j->>'variant_id','')::uuid;
    exception when others then
      raise exception 'invalid_variant_id';
    end;
    v_qty := coalesce((j->>'quantity')::integer, 0);
    if v_qty < 1 or v_qty > 99 then
      raise exception 'invalid_quantity';
    end if;

    select * into p
      from public.site_products
     where id = v_product_id and is_published = true
     for update;
    if not found then
      raise exception 'product_not_available';
    end if;

    select exists(
      select 1 from public.site_product_variants
       where product_id = p.id and is_active = true
    ) into v_has_variants;

    v_variant_name := null;
    v_image := p.cover_path;
    v_reserved := false;

    if v_has_variants then
      if v_variant_id is null then raise exception 'variant_required'; end if;
      select * into v
        from public.site_product_variants
       where id = v_variant_id and product_id = p.id and is_active = true
       for update;
      if not found then raise exception 'variant_not_available'; end if;
      v_price := coalesce(v.price, p.price);
      v_variant_name := v.name;
      v_image := coalesce(v.image_path, p.cover_path);
      if p.track_inventory then
        if (v.stock_qty - v.stock_reserved) >= v_qty then
          update public.site_product_variants
             set stock_reserved = stock_reserved + v_qty, updated_at = now()
           where id = v.id;
          v_reserved := true;
        end if;
      end if;
    else
      if v_variant_id is not null then raise exception 'variant_not_available'; end if;
      v_price := p.price;
      if p.track_inventory then
        if (p.stock_qty - p.stock_reserved) >= v_qty then
          update public.site_products
             set stock_reserved = stock_reserved + v_qty, updated_at = now()
           where id = p.id;
          v_reserved := true;
        end if;
      end if;
    end if;

    if v_price is null then raise exception 'price_not_available'; end if;
    v_line := round(v_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line;

    insert into public.shop_order_items(
      order_id, product_id, variant_id, product_name, variant_name,
      image_path, quantity, unit_price, line_total, inventory_reserved
    ) values (
      v_order_id, p.id, v_variant_id, p.name, v_variant_name,
      v_image, v_qty, v_price, v_line, v_reserved
    );
  end loop;

  -- Charge configured flat shipping once per order below THB 2,500 (before tax).
  v_shipping := case when v_subtotal < 2500 then v_shipping else 0 end;
  v_vat := round((v_subtotal + v_shipping) * 0.07, 2);
  v_total := round(v_subtotal + v_shipping + v_vat, 2);
  update public.shop_orders
     set subtotal = v_subtotal, shipping_fee = v_shipping, vat_amount = v_vat, total = v_total, updated_at = now()
   where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_no', v_order_no,
    'token', v_token,
    'subtotal', v_subtotal,
    'shipping_fee', v_shipping,
    'total', v_total,
    'vat_amount', v_vat,
    'reservation_minutes', v_minutes
  );
exception
  when others then
    raise;
end;
$function$

