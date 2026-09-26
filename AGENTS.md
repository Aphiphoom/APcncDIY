# AGENTS.md — APcncDIY Operating Rules

This file defines working rules for AI agents and maintainers operating on `Aphiphoom/APcncDIY`.

## Mandatory first step

Before changing code, read:

1. `README.md`
2. this file
3. the current version of every file you intend to modify

Do not rely only on previous chat summaries or cached copies.

## Direct Implementation Ownership Rule

One task owns its implementation end-to-end. Do not delegate or split core implementation across agents unless the user explicitly asks for delegation.

## Production domains

Primary:
- `https://apcncdiy.com`
- `https://www.apcncdiy.com`

Legacy compatibility site:
- `https://aphiphoom.github.io/Gcode/`

## Non-negotiable compatibility rule

AP Cabinet Pro 2.1.186 and older may still use the legacy GitHub Pages endpoints. Preserve them unless the user explicitly authorizes a breaking migration.

Do not remove or hard-redirect:

- `https://aphiphoom.github.io/Gcode/login.html`
- `https://aphiphoom.github.io/Gcode/membership.html`
- `https://aphiphoom.github.io/Gcode/version.json`

## Supabase

Project ref:
- `modbgnzikhrdvrcxnzqy`

Project URL:
- `https://modbgnzikhrdvrcxnzqy.supabase.co`

Rules:
- do not change projects for ordinary website/plugin tasks,
- do not rotate/revoke public client keys without explicit instruction,
- never commit service-role keys or secrets,
- preserve member/profile data,
- inspect auth redirects/templates before changing Site URL behavior.

## APcncDIY-specific files

Treat these as production-sensitive:

- `index.html`
- `login.html`
- `membership.html`
- `admin.html`
- `admin.js`
- `auth-client.js`
- `config.js`
- `styles.css`
- `manual.html`
- `manual.js`
- `manual.css`
- `manual-editor.html`
- `manual-editor.js`
- `model-viewer.html`
- `ap3d-viewer.js`
- `version.json`

## Do not blindly sync from Gcode

APcncDIY contains customizations that differ from `Aphiphoom/Gcode`, especially:

- custom `index.html`,
- AP CNC DIY logo,
- Kanit font,
- mobile admin layout,
- admin member count,
- expired-member sorting,
- new-domain auth/recovery URLs.

Copy only intentional changes and preserve APcncDIY-specific behavior.

## Plugin/web parity rule

When modifying browser-facing AP Cabinet Pro UI, check packaged copies too, especially:

- `login.html`
- `admin.html`
- `admin.js`
- `membership.html`

Domain constants must be correct for the target environment.

## Release rule

Never update `version.json` to a version that has no valid downloadable release asset.

Correct order:

1. build/test RBZ,
2. create GitHub Release,
3. upload RBZ,
4. verify asset URL,
5. update `version.json`,
6. verify live `https://apcncdiy.com/version.json`,
7. verify download URL.

Legacy `Aphiphoom/Gcode/version.json` is separate and must not be changed automatically.

## Deployment rule

Cloudflare auto-deploys this repository. A GitHub commit is not proof that production has updated.

For web-facing tasks, verify the live domain after deployment when practical.

Do not remove `.assetsignore`/Wrangler exclusions that protect repository internals from being published as static assets.

## UI rule

Current interface direction:

- Kanit font,
- AP CNC DIY logo,
- dark industrial theme for auth/member/admin,
- mobile/iPhone support,
- no horizontal overflow in critical forms/tables.

Any UI change should preserve desktop and mobile usability.

## Auth recovery rule

The new-domain password recovery flow must continue to support:

- dynamic redirect back to `https://apcncdiy.com/login.html`,
- two matching new-password fields,
- `supabase.auth.updateUser({ password: ... })`,
- legacy callback compatibility through Supabase allowlisted redirect URLs.

Do not replace dynamic recovery with a single hard-coded legacy URL.

## Change discipline

Before a destructive or high-impact change:

- inspect current production state,
- identify legacy impact,
- preserve backward compatibility,
- make the smallest coherent modification.

Avoid unrelated refactors while fixing a targeted issue.

## Completion checklist

Before reporting completion:

- syntax checked,
- target behavior checked,
- URLs/domain constants reviewed,
- mobile impact considered,
- legacy impact considered,
- release metadata not advanced without a real asset,
- deployment state distinguished from source state.
