# APcncDIY AI Video Gateway

Production endpoint:

`https://modbgnzikhrdvrcxnzqy.supabase.co/functions/v1/ai-video-generate`

The function is admin-only, requires a valid Supabase user JWT, and reads `GEMINI_API_KEY` only inside the Supabase runtime. The Google key, image bytes, prompt text, access token, and refresh token are not stored in the job table.

## Safe two-step flow

1. `estimate` validates the request, calculates the current estimated price, writes an audit record, and returns a short-lived one-time confirmation token. It does **not** call Veo generation.
2. Review the estimate.
3. `create` must receive the same prompt, images, and settings plus `confirm_cost: true`, the Job ID, and the one-time token. This is the only action that can call the paid `predictLongRunning` endpoint.
4. Poll `status` with the Job ID. Do not retry `create` after a timeout or an `unknown` state.
5. When complete, call `download`. Google retains generated videos for a limited time; future R2 persistence can be added behind this step.

The default database guardrails are a total experiment budget of THB 130, USD/THB safety conversion rate of 37, one active job at a time, and a ten-minute confirmation window. Completed and unknown jobs continue to reserve budget.

## Current supported models and prices

Pricing snapshot: 2026-10-10. Google has no free tier for Veo 3.1.

| Model | 720p | 1080p | 4K |
| --- | ---: | ---: | ---: |
| `veo-3.1-lite-generate-preview` | USD 0.05/s | USD 0.08/s | Not supported |
| `veo-3.1-fast-generate-preview` | USD 0.10/s | USD 0.12/s | USD 0.30/s |
| `veo-3.1-generate-preview` | USD 0.40/s | USD 0.40/s | USD 0.60/s |

All models support 4, 6, or 8 seconds at 720p and first/last-frame interpolation. 1080p and 4K require 8 seconds. Audio is always generated. Prices and preview model availability can change, so check Google pricing before paid use.

## PC client

Set these values in the shell environment, never in source control:

```powershell
$env:SUPABASE_URL = 'https://modbgnzikhrdvrcxnzqy.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY = '<public publishable key from the website config>'
$env:SUPABASE_ACCESS_TOKEN = '<short-lived access token for the signed-in admin>'
```

Secret/key health check and a non-generating Google model-list probe:

```powershell
python tools/ai_video_client.py health
python tools/ai_video_client.py models
```

Estimate only:

```powershell
python tools/ai_video_client.py estimate `
  --start-frame .\start.png `
  --end-frame .\end.png `
  --prompt "A cinematic macro shot of the APcncDIY T013 compression bit cutting clean plywood edges." `
  --model veo-3.1-lite-generate-preview `
  --duration 8 --aspect-ratio 9:16 --resolution 720p
```

Paid creation is deliberately a separate command. It is not run during installation:

```powershell
python tools/ai_video_client.py create `
  --job-id '<job id from estimate>' `
  --confirmation-token '<one-time token from estimate>' `
  --confirm-cost `
  --start-frame .\start.png --end-frame .\end.png `
  --prompt "<the exact same prompt>" `
  --model veo-3.1-lite-generate-preview `
  --duration 8 --aspect-ratio 9:16 --resolution 720p
```

Then use `status --job-id ...` and `download --job-id ... --output video.mp4`.

## Request example

```json
{
  "action": "estimate",
  "idempotency_key": "t013-campaign-001",
  "start_frame": { "mime_type": "image/png", "data": "<base64>" },
  "end_frame": { "mime_type": "image/png", "data": "<base64>" },
  "prompt": "English prompt",
  "model": "veo-3.1-lite-generate-preview",
  "duration_seconds": 8,
  "aspect_ratio": "9:16",
  "resolution": "720p"
}
```

An estimate response includes `job.id`, cost in USD/THB, `confirmation_token`, `confirmation_expires_at`, and `generation_called: false`.

## ChatGPT handoff

ChatGPT can prepare PNG/JPEG keyframes, the English prompt, and the JSON request. A normal chat session cannot be assumed to possess a signed-in APcncDIY admin JWT or direct network authority to this protected endpoint. The reliable handoff is to download the keyframes to the PC and run the CLI, or later connect a trusted Codex/local automation environment that receives a short-lived admin access token through the user's authenticated session. Never paste the Google key, Supabase secret/service-role key, access token, or refresh token into chat.
