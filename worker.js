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
const MARKET_ALLOWED_TYPES = new Map([["image/jpeg","jpg"],["image/png","png"],["image/webp","webp"],["model/gltf-binary","glb"],["application/octet-stream","glb"],["application/zip","zip"]]);

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

  const object = await env.PRODUCT_IMAGES.put(key, body, {
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
    path: `r2:${key}`,
    key,
    public_url: `${publicBase}/${encodedKey}`,
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
  sourceUrl.searchParams.set("source_path", `eq.r2:${key}`);
  sourceUrl.searchParams.set("limit", "1");
  const allowed = await fetch(sourceUrl, { headers });
  if (!allowed.ok) return json({ error: "authorization_failed" }, 502);
  const rows = await allowed.json();
  if (!rows?.length) return json({ error: "forbidden" }, 403);

  const object = request.method === "HEAD"
    ? await env.PRODUCT_IMAGES.head(key)
    : await env.PRODUCT_IMAGES.get(key);
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
  const existing = await env.PRODUCT_IMAGES.head(key);
  if (!existing) return json({ error: "not_found" }, 404);
  await env.PRODUCT_IMAGES.delete(key);
  return new Response(null, { status: 204 });
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
    if (url.pathname === `${MARKET_API_PREFIX}/upload`) {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return uploadMarketplacePublic(request, env);
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
