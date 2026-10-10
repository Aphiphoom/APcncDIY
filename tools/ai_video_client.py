#!/usr/bin/env python3
"""Admin CLI for the APcncDIY Supabase Veo gateway.

Secrets are read from environment variables. This client never contains a Google API key.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import pathlib
import sys
import urllib.error
import urllib.request
import uuid


DEFAULT_URL = "https://modbgnzikhrdvrcxnzqy.supabase.co"


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing environment variable: {name}")
    return value


def endpoint() -> str:
    root = os.environ.get("SUPABASE_URL", DEFAULT_URL).rstrip("/")
    return f"{root}/functions/v1/ai-video-generate"


def headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {required_env('SUPABASE_ACCESS_TOKEN')}",
        "apikey": required_env("SUPABASE_PUBLISHABLE_KEY"),
        "Content-Type": "application/json",
    }


def call(payload: dict, *, download_path: pathlib.Path | None = None) -> dict:
    request = urllib.request.Request(
        endpoint(),
        data=json.dumps(payload).encode("utf-8"),
        headers=headers(),
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            if download_path is not None:
                download_path.write_bytes(response.read())
                return {"ok": True, "saved_to": str(download_path)}
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            error = json.loads(raw)
        except json.JSONDecodeError:
            error = {"ok": False, "error": "http_error", "message": raw}
        error["http_status"] = exc.code
        return error


def image_payload(path_value: str | None) -> dict | None:
    if not path_value:
        return None
    path = pathlib.Path(path_value)
    if not path.is_file():
        raise SystemExit(f"Image not found: {path}")
    mime_type = mimetypes.guess_type(path.name)[0] or ""
    if mime_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise SystemExit("Images must be PNG, JPEG, or WebP")
    return {
        "mime_type": mime_type,
        "data": base64.b64encode(path.read_bytes()).decode("ascii"),
    }


def generation_payload(args: argparse.Namespace) -> dict:
    payload = {
        "prompt": args.prompt,
        "model": args.model,
        "duration_seconds": args.duration,
        "aspect_ratio": args.aspect_ratio,
        "resolution": args.resolution,
        "start_frame": image_payload(args.start_frame),
    }
    end_frame = image_payload(args.end_frame)
    if end_frame:
        payload["end_frame"] = end_frame
    return payload


def add_generation_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--start-frame", required=True)
    parser.add_argument("--end-frame")
    parser.add_argument("--prompt", required=True)
    parser.add_argument(
        "--model",
        default="veo-3.1-lite-generate-preview",
        choices=[
            "veo-3.1-lite-generate-preview",
            "veo-3.1-fast-generate-preview",
            "veo-3.1-generate-preview",
        ],
    )
    parser.add_argument("--duration", type=int, choices=[4, 6, 8], default=8)
    parser.add_argument("--aspect-ratio", choices=["9:16", "16:9"], default="9:16")
    parser.add_argument("--resolution", choices=["720p", "1080p", "4k"], default="720p")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="APcncDIY Google Veo gateway client")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("health")
    sub.add_parser("models")

    estimate = sub.add_parser("estimate", help="Validate and estimate only; does not call Veo generation")
    add_generation_args(estimate)
    estimate.add_argument("--idempotency-key", default=f"pc-{uuid.uuid4()}")

    create = sub.add_parser("create", help="Submit a paid job after explicit confirmation")
    add_generation_args(create)
    create.add_argument("--job-id", required=True)
    create.add_argument("--confirmation-token", required=True)
    create.add_argument(
        "--confirm-cost",
        action="store_true",
        help="Required acknowledgement that this command calls the paid Google Veo API",
    )

    status = sub.add_parser("status")
    status.add_argument("--job-id", required=True)
    download = sub.add_parser("download")
    download.add_argument("--job-id", required=True)
    download.add_argument("--output", required=True)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command in {"health", "models"}:
        result = call({"action": args.command})
    elif args.command == "estimate":
        result = call({"action": "estimate", "idempotency_key": args.idempotency_key, **generation_payload(args)})
    elif args.command == "create":
        if not args.confirm_cost:
            raise SystemExit("Refusing paid submission: add --confirm-cost only after reviewing the estimate")
        result = call({
            "action": "create",
            "job_id": args.job_id,
            "confirmation_token": args.confirmation_token,
            "confirm_cost": True,
            **generation_payload(args),
        })
    elif args.command == "status":
        result = call({"action": "status", "job_id": args.job_id})
    else:
        result = call({"action": "download", "job_id": args.job_id}, download_path=pathlib.Path(args.output))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
