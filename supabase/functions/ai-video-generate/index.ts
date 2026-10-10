import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const PRICING_AS_OF = "2026-10-10";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PROMPT_CHARS = 8_000;
const ACTIVE_STATUSES = ["submitting", "submitted", "running", "unknown"];

type ModelRule = {
  usdPerSecond: Record<string, number>;
  resolutions: string[];
  supportsLastFrame: boolean;
};

const MODEL_RULES: Record<string, ModelRule> = {
  "veo-3.1-lite-generate-preview": {
    usdPerSecond: { "720p": 0.05, "1080p": 0.08 },
    resolutions: ["720p", "1080p"],
    supportsLastFrame: true,
  },
  "veo-3.1-fast-generate-preview": {
    usdPerSecond: { "720p": 0.10, "1080p": 0.12, "4k": 0.30 },
    resolutions: ["720p", "1080p", "4k"],
    supportsLastFrame: true,
  },
  "veo-3.1-generate-preview": {
    usdPerSecond: { "720p": 0.40, "1080p": 0.40, "4k": 0.60 },
    resolutions: ["720p", "1080p", "4k"],
    supportsLastFrame: true,
  },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function cleanBase64(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "invalid_image", `${fieldName}.data must be a non-empty base64 string`);
  }
  const cleaned = value.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new HttpError(400, "invalid_image", `${fieldName}.data is not valid base64`);
  }
  const estimatedBytes = Math.floor((cleaned.length * 3) / 4) - (cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0);
  if (estimatedBytes <= 0 || estimatedBytes > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "image_too_large", `${fieldName} must be between 1 byte and 10 MiB`);
  }
  return cleaned;
}

function parseImage(value: unknown, fieldName: string, required: boolean): { mimeType: string; data: string } | null {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, "start_frame_required", "start_frame is required");
    return null;
  }
  if (typeof value !== "object") throw new HttpError(400, "invalid_image", `${fieldName} must be an object`);
  const source = value as Record<string, unknown>;
  const mimeType = String(source.mime_type || source.mimeType || "").toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
    throw new HttpError(400, "invalid_image_type", `${fieldName}.mime_type must be image/png, image/jpeg, or image/webp`);
  }
  return { mimeType, data: cleanBase64(source.data, fieldName) };
}

async function imageHash(image: { mimeType: string; data: string } | null): Promise<string | null> {
  return image ? await sha256(`${image.mimeType}:${image.data}`) : null;
}

function validateGeneration(body: Record<string, unknown>) {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    throw new HttpError(400, "invalid_prompt", `prompt must contain 1-${MAX_PROMPT_CHARS} characters`);
  }
  const model = String(body.model || "veo-3.1-lite-generate-preview");
  const rule = MODEL_RULES[model];
  if (!rule) throw new HttpError(400, "unsupported_model", "Unsupported or unpriced Veo model");
  const duration = Number(body.duration_seconds ?? body.duration ?? 8);
  if (![4, 6, 8].includes(duration)) throw new HttpError(400, "invalid_duration", "duration_seconds must be 4, 6, or 8");
  const aspectRatio = String(body.aspect_ratio || "9:16");
  if (!["9:16", "16:9"].includes(aspectRatio)) throw new HttpError(400, "invalid_aspect_ratio", "aspect_ratio must be 9:16 or 16:9");
  const resolution = String(body.resolution || "720p").toLowerCase();
  if (!rule.resolutions.includes(resolution)) throw new HttpError(400, "invalid_resolution", `${model} does not support ${resolution}`);
  if (["1080p", "4k"].includes(resolution) && duration !== 8) {
    throw new HttpError(400, "duration_resolution_conflict", `${resolution} requires an 8-second duration`);
  }
  const startFrame = parseImage(body.start_frame, "start_frame", true);
  const endFrame = parseImage(body.end_frame, "end_frame", false);
  if (endFrame && !rule.supportsLastFrame) throw new HttpError(400, "end_frame_not_supported", `${model} does not support an end frame`);
  return { prompt, model, rule, duration, aspectRatio, resolution, startFrame: startFrame!, endFrame };
}

function safeGoogleError(payload: unknown): { code: string; message: string } {
  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const nested = source.error && typeof source.error === "object" ? source.error as Record<string, unknown> : source;
  return {
    code: String(nested.status || nested.code || "google_api_error").slice(0, 120),
    message: String(nested.message || "Google API returned an error").slice(0, 1000),
  };
}

function extractVideoUri(operation: Record<string, unknown>): string | null {
  const response = operation.response as Record<string, unknown> | undefined;
  const generate = response?.generateVideoResponse as Record<string, unknown> | undefined;
  const samples = generate?.generatedSamples;
  if (!Array.isArray(samples) || !samples.length) return null;
  const video = (samples[0] as Record<string, unknown>)?.video as Record<string, unknown> | undefined;
  return typeof video?.uri === "string" ? video.uri : null;
}

function publicJob(job: Record<string, unknown>) {
  return {
    id: job.id,
    status: job.status,
    model: job.model,
    duration_seconds: job.duration_seconds,
    aspect_ratio: job.aspect_ratio,
    resolution: job.resolution,
    estimated_cost_usd: job.estimated_cost_usd,
    estimated_cost_thb: job.estimated_cost_thb,
    operation_id: job.google_operation_name,
    video_ready: Boolean(job.video_uri),
    download_endpoint: job.video_uri ? `?action=download&job_id=${job.id}` : null,
    error_code: job.error_code,
    error_message: job.error_message,
    created_at: job.created_at,
    updated_at: job.updated_at,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) throw new HttpError(401, "unauthorized", "A Supabase user access token is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
    if (!supabaseUrl || !anonKey) throw new HttpError(500, "server_configuration", "Supabase runtime variables are unavailable");

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw new HttpError(401, "unauthorized", "The access token is invalid or expired");
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (profileError || profile?.role !== "admin") throw new HttpError(403, "admin_required", "Only an APcncDIY administrator may use paid AI video generation");

    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { throw new HttpError(400, "invalid_json", "Request body must be valid JSON"); }
    }
    const action = String(body.action || url.searchParams.get("action") || "health");

    if (action === "health" || action === "models") {
      const result: Record<string, unknown> = {
        ok: true,
        function: "ai-video-generate",
        authenticated: true,
        admin: true,
        gemini_secret_configured: Boolean(geminiKey),
        generation_called: false,
        pricing_as_of: PRICING_AS_OF,
        configured_models: Object.keys(MODEL_RULES),
      };
      if (action === "models") {
        if (!geminiKey) throw new HttpError(500, "gemini_secret_missing", "GEMINI_API_KEY is not configured");
        const response = await fetch(`${GOOGLE_BASE_URL}/models?pageSize=1000`, { headers: { "x-goog-api-key": geminiKey } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const err = safeGoogleError(payload);
          throw new HttpError(502, "google_model_probe_failed", err.message, { google_code: err.code });
        }
        const models = Array.isArray(payload.models) ? payload.models as Array<Record<string, unknown>> : [];
        result.key_accessible_models = models.map((item) => String(item.name || "").replace(/^models\//, ""))
          .filter((name) => name.startsWith("veo-"));
        result.note = "Model listing is a non-generation probe and does not submit a paid Veo job.";
      }
      return json(result);
    }

    if (!geminiKey) throw new HttpError(500, "gemini_secret_missing", "GEMINI_API_KEY is not configured");

    const { data: settings, error: settingsError } = await supabase.from("ai_video_settings").select("*").eq("id", "default").single();
    if (settingsError || !settings) throw new HttpError(500, "settings_unavailable", "AI video budget settings are unavailable");

    if (action === "estimate") {
      const request = validateGeneration(body);
      const idempotencyKey = String(body.idempotency_key || "").trim();
      if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
        throw new HttpError(400, "invalid_idempotency_key", "idempotency_key must be 8-128 safe characters");
      }
      const perSecond = request.rule.usdPerSecond[request.resolution];
      const costUsd = Number((perSecond * request.duration).toFixed(4));
      const costThb = Number((costUsd * Number(settings.usd_thb_rate)).toFixed(2));

      const { data: committed } = await supabase.from("ai_video_jobs").select("estimated_cost_thb")
        .in("status", ["submitting", "submitted", "running", "succeeded", "unknown"]);
      const spentOrReserved = (committed || []).reduce((sum, row) => sum + Number(row.estimated_cost_thb || 0), 0);
      const remaining = Number((Number(settings.budget_limit_thb) - spentOrReserved).toFixed(2));
      if (costThb > remaining) {
        throw new HttpError(402, "budget_limit_exceeded", "Estimated cost exceeds the remaining experiment budget", {
          estimated_cost_thb: costThb, remaining_budget_thb: Math.max(0, remaining),
        });
      }

      const token = randomToken();
      const tokenHash = await sha256(token);
      const promptHash = await sha256(request.prompt);
      const startHash = await imageHash(request.startFrame);
      const endHash = await imageHash(request.endFrame);
      const expires = new Date(Date.now() + Number(settings.confirmation_ttl_minutes) * 60_000).toISOString();
      const now = new Date().toISOString();
      const { data: job, error: insertError } = await supabase.from("ai_video_jobs").insert({
        user_id: userData.user.id,
        idempotency_key: idempotencyKey,
        status: "estimated",
        model: request.model,
        duration_seconds: request.duration,
        aspect_ratio: request.aspectRatio,
        resolution: request.resolution,
        has_start_frame: true,
        has_end_frame: Boolean(request.endFrame),
        prompt_sha256: promptHash,
        request_summary: { start_frame_sha256: startHash, end_frame_sha256: endHash, pricing_as_of: PRICING_AS_OF },
        estimated_cost_usd: costUsd,
        estimated_cost_thb: costThb,
        confirmation_token_hash: tokenHash,
        confirmation_expires_at: expires,
        updated_at: now,
      }).select("*").single();
      if (insertError) {
        if (insertError.code === "23505") throw new HttpError(409, "duplicate_request", "This idempotency_key was already used; inspect the existing job instead of resubmitting");
        throw new HttpError(500, "job_create_failed", insertError.message);
      }
      return json({
        ok: true,
        generation_called: false,
        requires_confirmation: true,
        confirmation_token: token,
        confirmation_expires_at: expires,
        remaining_budget_before_job_thb: Math.max(0, remaining),
        job: publicJob(job),
      }, 201);
    }

    if (action === "create") {
      if (body.confirm_cost !== true) throw new HttpError(400, "cost_confirmation_required", "confirm_cost must be true");
      const jobId = String(body.job_id || "");
      const confirmationToken = String(body.confirmation_token || "");
      if (!jobId || !confirmationToken) throw new HttpError(400, "confirmation_required", "job_id and confirmation_token are required");
      const request = validateGeneration(body);
      const { data: existing, error: existingError } = await supabase.from("ai_video_jobs").select("*").eq("id", jobId).single();
      if (existingError || !existing) throw new HttpError(404, "job_not_found", "Job not found");
      if (existing.status !== "estimated") throw new HttpError(409, "job_not_estimated", `Job is already ${existing.status}; it will not be submitted again`);
      if (!existing.confirmation_expires_at || Date.parse(existing.confirmation_expires_at) <= Date.now()) throw new HttpError(410, "confirmation_expired", "The cost confirmation has expired");
      if (await sha256(confirmationToken) !== existing.confirmation_token_hash) throw new HttpError(403, "invalid_confirmation", "The one-time confirmation token is invalid");

      const promptHash = await sha256(request.prompt);
      const startHash = await imageHash(request.startFrame);
      const endHash = await imageHash(request.endFrame);
      const summary = existing.request_summary || {};
      if (existing.model !== request.model || existing.duration_seconds !== request.duration || existing.aspect_ratio !== request.aspectRatio ||
          existing.resolution !== request.resolution || existing.prompt_sha256 !== promptHash || summary.start_frame_sha256 !== startHash ||
          (summary.end_frame_sha256 || null) !== endHash) {
        throw new HttpError(409, "request_changed", "The confirmed request does not match the current prompt, frames, or settings");
      }

      const { data: committedNow, error: budgetError } = await supabase.from("ai_video_jobs").select("id,estimated_cost_thb")
        .in("status", ["submitting", "submitted", "running", "succeeded", "unknown"]);
      if (budgetError) throw new HttpError(500, "budget_check_failed", budgetError.message);
      const committedByOtherJobs = (committedNow || []).filter((row) => row.id !== jobId)
        .reduce((sum, row) => sum + Number(row.estimated_cost_thb || 0), 0);
      if (committedByOtherJobs + Number(existing.estimated_cost_thb) > Number(settings.budget_limit_thb)) {
        throw new HttpError(402, "budget_limit_exceeded", "The experiment budget changed or was consumed after this estimate; create was not submitted");
      }

      const { count: activeCount, error: countError } = await supabase.from("ai_video_jobs").select("id", { count: "exact", head: true })
        .in("status", ACTIVE_STATUSES);
      if (countError) throw new HttpError(500, "concurrency_check_failed", countError.message);
      if (Number(activeCount || 0) >= Number(settings.max_concurrent_jobs)) {
        throw new HttpError(429, "concurrency_limit", "Another Veo job is active or has an unknown submission state");
      }

      const now = new Date().toISOString();
      const { data: locked, error: lockError } = await supabase.from("ai_video_jobs").update({
        status: "submitting",
        confirmed_at: now,
        confirmation_token_hash: null,
        updated_at: now,
      }).eq("id", jobId).eq("status", "estimated").select("*").maybeSingle();
      if (lockError) throw new HttpError(500, "job_lock_failed", lockError.message);
      if (!locked) throw new HttpError(409, "duplicate_submission_prevented", "Another request already claimed this job");

      const instance: Record<string, unknown> = {
        prompt: request.prompt,
        image: { inlineData: { mimeType: request.startFrame.mimeType, data: request.startFrame.data } },
      };
      if (request.endFrame) instance.lastFrame = { inlineData: { mimeType: request.endFrame.mimeType, data: request.endFrame.data } };
      const googleBody = {
        instances: [instance],
        parameters: {
          aspectRatio: request.aspectRatio,
          durationSeconds: String(request.duration),
          resolution: request.resolution,
          numberOfVideos: 1,
          personGeneration: "allow_adult",
        },
      };

      let googleResponse: Response;
      try {
        googleResponse = await fetch(`${GOOGLE_BASE_URL}/models/${encodeURIComponent(request.model)}:predictLongRunning`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
          body: JSON.stringify(googleBody),
        });
      } catch (error) {
        await supabase.from("ai_video_jobs").update({
          status: "unknown",
          error_code: "submission_outcome_unknown",
          error_message: String(error).slice(0, 1000),
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
        throw new HttpError(502, "submission_outcome_unknown", "The network result is unknown. Do not retry; inspect this job manually.");
      }

      const payload = await googleResponse.json().catch(() => ({}));
      if (!googleResponse.ok || typeof payload.name !== "string") {
        const err = safeGoogleError(payload);
        await supabase.from("ai_video_jobs").update({
          status: "failed", error_code: err.code, error_message: err.message, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", jobId);
        throw new HttpError(502, "google_submission_failed", err.message, { google_code: err.code });
      }
      const { data: submitted, error: submittedError } = await supabase.from("ai_video_jobs").update({
        status: "submitted",
        google_operation_name: payload.name,
        google_response_summary: { name: payload.name, done: Boolean(payload.done) },
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", jobId).select("*").single();
      if (submittedError) throw new HttpError(500, "job_update_failed", "Google accepted the job, but the local audit record could not be updated", { operation_id: payload.name });
      return json({ ok: true, job: publicJob(submitted) }, 202);
    }

    if (action === "status") {
      const jobId = String(body.job_id || url.searchParams.get("job_id") || "");
      const { data: job, error: jobError } = await supabase.from("ai_video_jobs").select("*").eq("id", jobId).single();
      if (jobError || !job) throw new HttpError(404, "job_not_found", "Job not found");
      if (!["submitted", "running"].includes(job.status) || !job.google_operation_name) return json({ ok: true, job: publicJob(job) });

      const response = await fetch(`${GOOGLE_BASE_URL}/${job.google_operation_name}`, { headers: { "x-goog-api-key": geminiKey } });
      const operation = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        const err = safeGoogleError(operation);
        throw new HttpError(502, "google_status_failed", err.message, { google_code: err.code });
      }
      let nextStatus = operation.done === true ? "succeeded" : "running";
      let errorCode = null;
      let errorMessage = null;
      if (operation.done === true && operation.error) {
        nextStatus = "failed";
        const err = safeGoogleError(operation);
        errorCode = err.code;
        errorMessage = err.message;
      }
      const videoUri = nextStatus === "succeeded" ? extractVideoUri(operation) : null;
      if (nextStatus === "succeeded" && !videoUri) {
        nextStatus = "failed";
        errorCode = "video_uri_missing";
        errorMessage = "Google reported completion without a downloadable video URI";
      }
      const timestamp = new Date().toISOString();
      const { data: updated, error: updateError } = await supabase.from("ai_video_jobs").update({
        status: nextStatus,
        video_uri: videoUri,
        error_code: errorCode,
        error_message: errorMessage,
        google_response_summary: { name: operation.name, done: operation.done === true, has_video: Boolean(videoUri), has_error: Boolean(operation.error) },
        last_checked_at: timestamp,
        completed_at: operation.done === true ? timestamp : null,
        updated_at: timestamp,
      }).eq("id", jobId).select("*").single();
      if (updateError) throw new HttpError(500, "job_update_failed", updateError.message);
      return json({ ok: true, job: publicJob(updated) });
    }

    if (action === "download") {
      const jobId = String(body.job_id || url.searchParams.get("job_id") || "");
      const { data: job, error: jobError } = await supabase.from("ai_video_jobs").select("id,status,video_uri").eq("id", jobId).single();
      if (jobError || !job) throw new HttpError(404, "job_not_found", "Job not found");
      if (job.status !== "succeeded" || !job.video_uri) throw new HttpError(409, "video_not_ready", "The video is not ready for download");
      const response = await fetch(job.video_uri, { redirect: "follow", headers: { "x-goog-api-key": geminiKey } });
      if (!response.ok || !response.body) throw new HttpError(502, "video_download_failed", "Google video download failed");
      return new Response(response.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": response.headers.get("Content-Type") || "video/mp4",
          "Content-Disposition": `attachment; filename="${job.id}.mp4"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    throw new HttpError(400, "unknown_action", "action must be health, models, estimate, create, status, or download");
  } catch (error) {
    if (error instanceof HttpError) return json({ ok: false, error: error.code, message: error.message, details: error.details }, error.status);
    console.error("ai-video-generate unexpected error", error);
    return json({ ok: false, error: "internal_error", message: "Unexpected server error" }, 500);
  }
});
