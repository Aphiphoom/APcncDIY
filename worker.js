const API_PREFIX = "/api/product-images";
const OBJECT_PREFIX = "product-images/";
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const ALLOWED_FOLDERS = new Set(["covers", "gallery", "variants"]);
const MARKET_API_PREFIX = "/api/marketplace-public";
const MARKET_OBJECT_PREFIX = "marketplace-public/";
const MARKET_MAX_BYTES = 50 * 1024 * 1024;
const MARKET_SOURCE_MAX_BYTES = 90 * 1024 * 1024;
const MARKET_ALLOWED_TYPES = new Map([["image/jpeg","jpg"],["image/png","png"],["image/webp","webp"],["model/gltf-binary","glb"],["application/octet-stream","glb"],["application/zip","zip"]]);\nconst SHOP_SLIP_PREFIX = "order-slips/";\nconst SHOP_SLIP_MAX_BYTES = 12 * 1024 * 1024;\nconst SHOP_SLIP_TYPES = new Map([["image/jpeg","jpg"],["image/png","png"],["image/webp","webp"],["application/pdf","pdf"]]);

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function bearerToken(request) {
  const match = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

async function requireAdmin(request, env) {
  const token = bearerToken(request);
  if (!token) return { error: json({ error: "unauthorized" }, 401) };

  const headers = {
    Authorization: `Bearer ${token}`,
    apikey: env.SUPABASE_PUBLISHABLE_KEY,
    Accept: "application/json",
  };
  const authResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers });
  if (!authResponse.ok) return { error: json({ error: "unauthorized" }, 401) };

  const user = await authResponse.json();
  if (!user?.id) return { error: json({ error: "unauthorized" }, 401) };

  const profileUrl = new URL(`${env.SUPABASE_URL}/rest/v1/profiles`);
  profileUrl.searchParams.set("select", "role");
  profileUrl.searchParams.set("id", `eq.${user.id}`);
  const profileResponse = await fetch(profileUrl, { headers });
  if (!profileResponse.ok) return { error: json({ error: "authorization_failed" }, 502) };

  const profiles = await profileResponse.json();
  if (profiles?.[0]?.role !== "admin") return { error: json({ error: "forbidden" }, 403) };
  return { user };
}

async function requireMarketplaceSeller(request, env) {
  const token = bearerToken(request);
  if (!token) return { error: json({ error: "unauthorized" }, 401) };

  const headers = {
    Authorization: `Bearer ${token}`,
    apikey: env.SUPABASE_PUBLISHABLE_KEY,
    Accept: "application/json",
  };
  const authResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers });
  if (!authResponse.ok) return { error: json({ error: "unauthorized" }, 401) };

  const user = await authResponse.json();
  if (!user?.id) return { error: json({ error: "unauthorized" }, 401) };

  const profileUrl = new URL(`${env.SUPABASE_URL}/rest/v1/profiles`);
  profileUrl.searchParams.set("select", "role,status,expires_at,seller_level");
  profileUrl.searchParams.set("id", `eq.${user.id}`);
  const profileResponse = await fetch(profileUrl, { headers });
  if (!profileResponse.ok) return { error: json({ error: "authorization_failed" }, 502) };

  const profile = (await profileResponse.json())?.[0] || {};
  const admin = profile.role === "admin";
  const active = admin || (profile.status === "active" && profile.expires_at && Date.parse(profile.expires_at) > Date.now());
  const seller = admin || Number(profile.seller_level || 0) > 0;
  if (!active || !seller) return { error: json({ error: "marketplace_seller_required" }, 403) };
  return { user, admin };
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
}

async function uploadMarketplacePublic(request, env) {
  const auth = await requireMarketplaceSeller(request, env);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const listingId = url.searchParams.get("listing_id") || "";
  const kind = url.searchParams.get("kind") || "";
  if (!validUuid(listingId)) return json({ error: "invalid_listing_id" }, 400);
  if (!["preview","cover","gallery","source"].includes(kind)) return json({ error: "invalid_kind" }, 400);

  const type = (request.headers.get("Content-Type") || "").split(";", 1)[0].toLowerCase();
  const extension = MARKET_ALLOWED_TYPES.get(type);
  if (!extension) return json({ error: "unsupported_file_type" }, 415);
  if (kind === "preview" && extension !== "glb") return json({ error: "preview_must_be_glb" }, 415);
  if (kind === "source" && extension !== "zip") return json({ error: "source_must_be_zip" }, 415);
  if (!["preview","source"].includes(kind) && (extension === "glb" || extension === "zip")) return json({ error: "image_required" }, 415);

  const sizeLimit = kind === "source" ? MARKET_SOURCE_MAX_BYTES : MARKET_MAX_BYTES;
  const declaredSize = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declaredSize) && declaredSize > sizeLimit) return json({ error: "file_too_large" }, 413);
  const body = await request.arrayBuffer();
  if (!body.byteLength) return json({ error: "empty_file" }, 400);
  if (body.byteLength > sizeLimit) return json({ error: "file_too_large" }, 413);

  const base = `${MARKET_OBJECT_PREFIX}${auth.user.id}/${listingId}/`;
  const key = kind === "preview"
    ? `${base}preview/model.glb`
    : kind === "source"
      ? `${base}source/${crypto.randomUUID()}.zip`
      : `${base}images/${kind}-${crypto.randomUUID()}.${extension}`;

  let originalName = "";
  try { originalName = decodeURIComponent(request.headers.get("X-File-Name") || "").slice(0, 240); } catch {}

  const privateSource = kind === "source" && !!env.MARKET_SOURCES;
  const bucket = privateSource ? env.MARKET_SOURCES : env.PRODUCT_IMAGES;
  const object = await bucket.put(key, body, {
    httpMetadata: {
      contentType: type === "application/octet-stream" && extension === "glb" ? "model/gltf-binary" : type,
      cacheControl: kind === "source" ? "private, no-store" : "public, max-age=31536000, immutable",
    },
    customMetadata: { uploadedBy: auth.user.id, listingId, kind, originalName },
  });
  if (!object) return json({ error: "upload_conflict" }, 409);

  const publicBase = env.PRODUCT_IMAGE_PUBLIC_BASE.replace(/\/$/, "");
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return json({
    path: `${privateSource ? "r2private:" : "r2:"}${key}`,
    key,
    public_url: kind === "source" ? null : `${publicBase}/${encodedKey}`,
    private_source: privateSource,
    size: object.size,
    etag: object.etag,
  }, 201);
}

function marketplaceObjectKeyFromUrl(url) {
  const marker = `${MARKET_API_PREFIX}/object/`;
  if (!url.pathname.startsWith(marker)) return "";
  try {
    const key = url.pathname.slice(marker.length).split("/").map(decodeURIComponent).join("/");
    if (!key.startsWith(MARKET_OBJECT_PREFIX) || key.includes("..") || key.includes("\\")) return "";
    return key;
  } catch {
    return "";
  }
}


async function readMarketplaceSource(request, env, key) {
  const token = bearerToken(request);
  if (!token) return json({ error: "unauthorized" }, 401);
  const headers = {
    Authorization: `Bearer ${token}`,
    apikey: env.SUPABASE_PUBLISHABLE_KEY,
    Accept: "application/json",
  };
  const sourceUrl = new URL(`${env.SUPABASE_URL}/rest/v1/market_model_sources`);
  sourceUrl.searchParams.set("select", "model_id,source_path");
  sourceUrl.searchParams.set("or", `(source_path.eq.r2private:${key},source_path.eq.r2:${key})`);
  sourceUrl.searchParams.set("limit", "1");
  const allowed = await fetch(sourceUrl, { headers });
  if (!allowed.ok) return json({ error: "authorization_failed" }, 502);
  const rows = await allowed.json();
  if (!rows?.length) return json({ error: "forbidden" }, 403);

  const privateSource = String(rows[0].source_path || "").startsWith("r2private:");
  if (privateSource && !env.MARKET_SOURCES) return json({ error: "private_source_storage_unavailable" }, 503);
  const bucket = privateSource ? env.MARKET_SOURCES : env.PRODUCT_IMAGES;
  const object = request.method === "HEAD" ? await bucket.head(key) : await bucket.get(key);
  if (!object) return json({ error: "not_found" }, 404);
  const responseHeaders = new Headers();
  object.writeHttpMetadata(responseHeaders);
  responseHeaders.set("ETag", object.httpEtag);
  responseHeaders.set("Cache-Control", "private, no-store");
  responseHeaders.set("Content-Length", String(object.size));
  return new Response(request.method === "HEAD" ? null : object.body, { headers: responseHeaders });
}

async function deleteMarketplacePublic(request, env, key) {
  const auth = await requireMarketplaceSeller(request, env);
  if (auth.error) return auth.error;
  const ownerPrefix = `${MARKET_OBJECT_PREFIX}${auth.user.id}/`;
  if (!auth.admin && !key.startsWith(ownerPrefix)) return json({ error: "forbidden" }, 403);

  if (key.includes("/source/") && env.MARKET_SOURCES) {
    const privateExisting = await env.MARKET_SOURCES.head(key);
    if (privateExisting) {
      await env.MARKET_SOURCES.delete(key);
      return new Response(null, { status: 204 });
    }
  }
  const existing = await env.PRODUCT_IMAGES.head(key);
  if (!existing) return json({ error: "not_found" }, 404);
  await env.PRODUCT_IMAGES.delete(key);
  return new Response(null, { status: 204 });
}

async function supabaseRpc(request, env, functionName, payload) {
  const token = bearerToken(request);
  if (!token) return { error: json({ error: "unauthorized" }, 401) };
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { error: json({ error: "rpc_failed", detail }, response.status) };
  }
  return { data: await response.json().catch(() => ({})) };
}

async function anonRpc(env, functionName, payload) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { error: json({ error: "rpc_failed", detail: data }, response.status) };
  return { data };
}

async function uploadShopSlip(request, env) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("order_id") || "";
  const token = url.searchParams.get("token") || "";
  if (!validUuid(orderId) || token.length < 32) return json({ error: "invalid_order" }, 400);

  const type = (request.headers.get("Content-Type") || "").split(";", 1)[0].toLowerCase();
  const ext = SHOP_SLIP_TYPES.get(type);
  if (!ext) return json({ error: "unsupported_file_type" }, 415);
  const declaredSize = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declaredSize) && declaredSize > SHOP_SLIP_MAX_BYTES) return json({ error: "file_too_large" }, 413);

  const check = await anonRpc(env, "shop_guest_order_upload_info", { p_order_id: orderId, p_token: token });
  if (check.error) return check.error;

  const body = await request.arrayBuffer();
  if (!body.byteLength) return json({ error: "empty_file" }, 400);
  if (body.byteLength > SHOP_SLIP_MAX_BYTES) return json({ error: "file_too_large" }, 413);

  const key = `${SHOP_SLIP_PREFIX}${orderId}/${crypto.randomUUID()}.${ext}`;
  let originalName = "";
  try { originalName = decodeURIComponent(request.headers.get("X-File-Name") || "").slice(0, 240); } catch {}

  const object = await env.PRODUCT_IMAGES.put(key, body, {
    httpMetadata: { contentType: type, cacheControl: "private, no-store" },
    customMetadata: { orderId, kind: "payment-slip", originalName },
  });
  if (!object) return json({ error: "upload_conflict" }, 409);

  const saved = await anonRpc(env, "submit_guest_shop_slip", {
    p_order_id: orderId,
    p_token: token,
    p_slip_path: `r2:${key}`,
    p_original_name: originalName,
    p_content_type: type,
  });
  if (saved.error) {
    await env.PRODUCT_IMAGES.delete(key);
    return saved.error;
  }

  const oldPath = check.data?.previous_slip_path || "";
  if (typeof oldPath === "string" && oldPath.startsWith("r2:" + SHOP_SLIP_PREFIX)) {
    await env.PRODUCT_IMAGES.delete(oldPath.slice(3)).catch(() => {});
  }
  return json({ ok: true, status: "payment_submitted" }, 201);
}

async function readShopSlip(request, env, orderId) {
  if (!validUuid(orderId)) return json({ error: "invalid_order_id" }, 400);
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  const token = bearerToken(request);
  const headers = {
    Authorization: `Bearer ${token}`,
    apikey: env.SUPABASE_PUBLISHABLE_KEY,
    Accept: "application/json",
  };
  const query = new URL(`${env.SUPABASE_URL}/rest/v1/shop_orders`);
  query.searchParams.set("select", "slip_path,slip_content_type,slip_original_name");
  query.searchParams.set("id", `eq.${orderId}`);
  query.searchParams.set("limit", "1");
  const response = await fetch(query, { headers });
  if (!response.ok) return json({ error: "order_lookup_failed" }, 502);
  const row = (await response.json())?.[0];
  const path = String(row?.slip_path || "");
  if (!path.startsWith("r2:" + SHOP_SLIP_PREFIX)) return json({ error: "slip_not_found" }, 404);
  const key = path.slice(3);
  const object = await env.PRODUCT_IMAGES.get(key);
  if (!object) return json({ error: "slip_not_found" }, 404);
  const out = new Headers();
  out.set("Content-Type", row?.slip_content_type || object.httpMetadata?.contentType || "application/octet-stream");
  out.set("Cache-Control", "private, no-store");
  out.set("Content-Disposition", `inline; filename="${String(row?.slip_original_name || "slip").replace(/[\\"]/g, "_")}"`);
  out.set("Content-Length", String(object.size));
  return new Response(object.body, { headers: out });
}

function pathInfo(value) {
  const text = String(value || "");
  if (text.startsWith("r2private:")) return { kind: "private", key: text.slice("r2private:".length) };
  if (text.startsWith("r2:")) return { kind: "public", key: text.slice("r2:".length) };
  return null;
}

async function purgeMarketplaceModel(request, env) {
  const url = new URL(request.url);
  const modelId = url.searchParams.get("model_id") || "";
  if (!validUuid(modelId)) return json({ error: "invalid_model_id" }, 400);

  const manifestResult = await supabaseRpc(request, env, "marketplace_purge_manifest", { p_model_id: modelId });
  if (manifestResult.error) return manifestResult.error;
  const manifest = manifestResult.data || {};

  const paths = [
    manifest.preview_path,
    manifest.cover_path,
    ...(Array.isArray(manifest.gallery_paths) ? manifest.gallery_paths : []),
    manifest.source_path,
  ].filter(Boolean);

  for (const value of paths) {
    const info = pathInfo(value);
    if (!info) continue;
    if (info.kind === "private") {
      if (!env.MARKET_SOURCES) return json({ error: "private_source_storage_unavailable" }, 503);
      await env.MARKET_SOURCES.delete(info.key);
    } else {
      await env.PRODUCT_IMAGES.delete(info.key);
    }
  }

  const completeResult = await supabaseRpc(request, env, "complete_market_model_purge", { p_model_id: modelId });
  if (completeResult.error) return completeResult.error;
  return json({ ok: true, purged: true, model_id: modelId });
}

function objectKeyFromUrl(url) {
  const marker = `${API_PREFIX}/object/`;
  if (!url.pathname.startsWith(marker)) return "";
  try {
    const key = url.pathname.slice(marker.length).split("/").map(decodeURIComponent).join("/");
    if (!key.startsWith(OBJECT_PREFIX) || key.includes("..") || key.includes("\\")) return "";
    return key;
  } catch {
    return "";
  }
}

async function uploadProductImage(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;

  const type = (request.headers.get("Content-Type") || "").split(";", 1)[0].toLowerCase();
  const extension = ALLOWED_TYPES.get(type);
  if (!extension) return json({ error: "unsupported_image_type" }, 415);

  const declaredSize = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_IMAGE_BYTES) {
    return json({ error: "file_too_large" }, 413);
  }

  const folder = new URL(request.url).searchParams.get("folder") || "";
  if (!ALLOWED_FOLDERS.has(folder)) return json({ error: "invalid_folder" }, 400);

  const body = await request.arrayBuffer();
  if (!body.byteLength) return json({ error: "empty_file" }, 400);
  if (body.byteLength > MAX_IMAGE_BYTES) return json({ error: "file_too_large" }, 413);

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const key = `${OBJECT_PREFIX}${folder}/${year}/${month}/${crypto.randomUUID()}.${extension}`;
  let originalName = "";
  try {
    originalName = decodeURIComponent(request.headers.get("X-File-Name") || "").slice(0, 240);
  } catch {
    originalName = "";
  }

  const object = await env.PRODUCT_IMAGES.put(key, body, {
    httpMetadata: {
      contentType: type,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: { uploadedBy: auth.user.id, originalName },
  });
  if (!object) return json({ error: "upload_conflict" }, 409);

  const publicBase = env.PRODUCT_IMAGE_PUBLIC_BASE.replace(/\/$/, "");
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return json({
    path: `r2:${key}`,
    key,
    public_url: `${publicBase}/${encodedKey}`,
    api_url: `${API_PREFIX}/object/${encodedKey}`,
    size: object.size,
    etag: object.etag,
  }, 201);
}

async function readProductImage(request, env, key) {
  const object = request.method === "HEAD"
    ? await env.PRODUCT_IMAGES.head(key)
    : await env.PRODUCT_IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", object.httpMetadata?.cacheControl || "public, max-age=3600");
  headers.set("Content-Length", String(object.size));
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

async function deleteProductImage(request, env, key) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth.error;
  const existing = await env.PRODUCT_IMAGES.head(key);
  if (!existing) return json({ error: "not_found" }, 404);
  await env.PRODUCT_IMAGES.delete(key);
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/shop-orders/slip") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return uploadShopSlip(request, env);
    }
    if (url.pathname.startsWith("/api/shop-orders/slip/")) {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return readShopSlip(request, env, url.pathname.slice("/api/shop-orders/slip/".length));
    }
    if (url.pathname === `${MARKET_API_PREFIX}/upload`) {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return uploadMarketplacePublic(request, env);
    }
    if (url.pathname === `${MARKET_API_PREFIX}/purge`) {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return purgeMarketplaceModel(request, env);
    }

    const marketplaceKey = marketplaceObjectKeyFromUrl(url);
    if (marketplaceKey) {
      if ((request.method === "GET" || request.method === "HEAD") && marketplaceKey.includes("/source/")) {
        return readMarketplaceSource(request, env, marketplaceKey);
      }
      if (request.method === "DELETE") return deleteMarketplacePublic(request, env, marketplaceKey);
      return json({ error: "method_not_allowed" }, 405);
    }

    if (url.pathname === `${API_PREFIX}/upload`) {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return uploadProductImage(request, env);
    }

    const key = objectKeyFromUrl(url);
    if (key) {
      if (request.method === "GET" || request.method === "HEAD") return readProductImage(request, env, key);
      if (request.method === "DELETE") return deleteProductImage(request, env, key);
      return json({ error: "method_not_allowed" }, 405);
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
