#!/usr/bin/env python3
"""Publish the highest AP Cabinet Pro RBZ asset from the fixed GitHub release."""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


REPO = "Aphiphoom/APcncDIY"
TAG = "AP_Cabinet_Pro"
ASSET_NAME = re.compile(r"^AP_Cabinet_Pro_V(\d+)\.(\d+)\.(\d+)\.rbz$")
METADATA = Path("version.json")


def api_json(url):
    token = os.environ["GITHUB_TOKEN"]
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "apcncdiy-version-sync",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def version_tuple(value):
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", str(value))
    if not match:
        raise ValueError(f"Invalid version: {value!r}")
    return tuple(map(int, match.groups()))


def main():
    release = api_json(f"https://api.github.com/repos/{REPO}/releases/tags/{TAG}")
    if release.get("draft") or release.get("prerelease"):
        raise RuntimeError("The target release must be published and non-prerelease")

    assets = []
    page = 1
    while True:
        batch = api_json(
            f"https://api.github.com/repos/{REPO}/releases/{release['id']}/assets?per_page=100&page={page}"
        )
        assets.extend(batch)
        if len(batch) < 100:
            break
        page += 1

    candidates = []
    for asset in assets:
        match = ASSET_NAME.fullmatch(asset.get("name", ""))
        if not match or asset.get("state") != "uploaded" or asset.get("size", 0) <= 0:
            continue
        expected = f"https://github.com/{REPO}/releases/download/{TAG}/{asset['name']}"
        if asset.get("browser_download_url") != expected:
            continue
        candidates.append((tuple(map(int, match.groups())), asset))

    if not candidates:
        raise RuntimeError("No completed, correctly named AP Cabinet Pro RBZ asset found")

    newest_version, asset = max(candidates, key=lambda item: item[0])
    current = json.loads(METADATA.read_text(encoding="utf-8"))
    old_version = version_tuple(current["latest_version"])
    if newest_version < old_version:
        print("Release is older than version.json; refusing to downgrade")
        return

    version = ".".join(map(str, newest_version))
    desired = {
        "latest_version": version,
        "file_name": asset["name"],
        "download_url": asset["browser_download_url"],
        "release_url": release["html_url"],
    }
    if newest_version > old_version:
        created = asset.get("created_at") or datetime.now(timezone.utc).isoformat()
        desired["published_at"] = created[:10]
        desired["notes"] = f"AP Cabinet Pro V{version} พร้อมดาวน์โหลดและอัปเดต"

    if all(current.get(key) == value for key, value in desired.items()):
        print(f"Already up to date: {version}")
        return
    current.update(desired)
    METADATA.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated version.json to {version}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, urllib.error.HTTPError, urllib.error.URLError, RuntimeError) as exc:
        print(f"Release sync failed: {exc}", file=sys.stderr)
        sys.exit(1)
