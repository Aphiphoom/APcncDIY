# APcncDIY

Official web repository for **AP CNC DIY** and the web-facing services used by **AP Cabinet Pro**.

> **AI / maintainer entry point:** Read this file before changing authentication, deployment, release metadata, or any page shared with AP Cabinet Pro. Also read `AGENTS.md` for non-negotiable working rules.

## 1. Project purpose

This repository serves the production website at:

- `https://apcncdiy.com`
- `https://www.apcncdiy.com`

It contains the public website, AP Cabinet Pro membership/authentication pages, admin tools, manual, model viewer, and `version.json` used by newer AP Cabinet Pro builds.

The site is deployed through **Cloudflare Workers/Assets** from this GitHub repository.

## 2. Related systems

### New production web stack

- GitHub repo: `Aphiphoom/APcncDIY`
- Production domain: `https://apcncdiy.com`
- Cloudflare Worker project: `apcncdiy`
- Supabase project ref: `modbgnzikhrdvrcxnzqy`
- Supabase project URL: `https://modbgnzikhrdvrcxnzqy.supabase.co`
- Main product: AP Cabinet Pro

### Legacy stack that MUST remain compatible

Legacy repository:

- `Aphiphoom/Gcode`
- Legacy site: `https://aphiphoom.github.io/Gcode/`

AP Cabinet Pro **2.1.186 and older** may still depend on these endpoints:

- `https://aphiphoom.github.io/Gcode/login.html`
- `https://aphiphoom.github.io/Gcode/membership.html`
- `https://aphiphoom.github.io/Gcode/version.json`

Do not delete, redirect, or repurpose those legacy endpoints without an explicit migration plan and regression testing.

## 3. Migration architecture

The migration is intentionally additive, not destructive:

```text
AP Cabinet Pro 2.1.186 and older
        |
        +--> GitHub Pages: Aphiphoom/Gcode
        |
        +--> SAME Supabase project/database

AP Cabinet Pro 2.1.189+
        |
        +--> https://apcncdiy.com
        |
        +--> SAME Supabase project/database
```

The same member accounts and Supabase data are shared by both generations during the transition.

## 4. Authentication rules

Authentication is handled by Supabase Auth.

Important rules:

1. Do not change the Supabase project unless explicitly requested.
2. Do not rotate/revoke the current publishable/anon key merely as part of a UI/domain change.
3. Supabase Redirect URLs must continue to allow both new and legacy login callbacks.
4. New web flows should use `https://apcncdiy.com/login.html`.
5. Legacy AP Cabinet Pro versions must remain able to use `https://aphiphoom.github.io/Gcode/login.html`.
6. Email templates should prefer dynamic Supabase redirect handling (`ConfirmationURL` / `RedirectTo`) rather than hard-coding one domain.

### Password recovery flow

The new login page implements the standard Supabase recovery flow:

1. `resetPasswordForEmail(..., { redirectTo: 'https://apcncdiy.com/login.html' })`
2. Supabase verifies the recovery token.
3. User returns to `login.html` in recovery mode.
4. The page displays two new-password fields.
5. Passwords must match.
6. `supabase.auth.updateUser({ password: newPassword })` updates the credential.
7. User is signed out and returned to login.

Do not simplify this into a hard-coded reset URL.

## 5. Important repository files

### Public website

- `index.html` — APcncDIY landing page. It has its own visual styling and should not be overwritten with the legacy Gcode index.
- `styles.css` — shared dark industrial styling used by login/admin/membership pages.
- `assets/ap-cnc-diy-logo.jpg` — main AP CNC DIY logo.

### Authentication / membership

- `login.html` — login, signup, forgot password, recovery, member-status UI.
- `membership.html` — membership information / renewal page.
- `auth-client.js` — shared web auth helper.
- `config.js` — Supabase public configuration.

### Admin

- `admin.html`
- `admin.js`

APcncDIY Admin has project-specific customizations and must NOT be blindly overwritten by the old Gcode version. Current behavior includes:

- AP CNC DIY logo in header/access gate.
- Kanit font.
- responsive/mobile layout.
- member count next to the member-list heading.
- expired members sorted to the bottom.
- remaining membership days.
- member detail / seller level / credit tools / login-history UI.

### Manual

- `manual.html`
- `manual.js`
- `manual.css`
- `manual-editor.html`
- `manual-editor.js`

### 3D viewer

- `model-viewer.html`
- `ap3d-viewer.js`

### Update metadata

- `version.json` — update metadata for AP Cabinet Pro builds that use the new domain.

Do not modify the legacy `Aphiphoom/Gcode/version.json` just because the new-domain version changes.

## 6. Typography / design

The current web UI uses **Kanit** for normal interface text.

Primary visual direction:

- Industrial dark theme for AP Cabinet Pro/member/admin pages.
- AP CNC DIY logo instead of the old orange `AP` text mark.
- Keep pages responsive for iPhone/mobile use.

When editing shared CSS, verify at minimum:

- desktop width
- iPhone/mobile width
- login/signup/recovery states
- admin table scrolling
- form controls and buttons do not overflow

## 7. Cloudflare deployment

Production hosting is Cloudflare Workers/Assets connected to this GitHub repository.

Cloudflare project:

- Worker name: `apcncdiy`
- Custom domains: `apcncdiy.com`, `www.apcncdiy.com`

The repo contains Cloudflare deployment configuration (`wrangler.jsonc`) and `.assetsignore`.

Do not remove ignore rules that prevent repository internals such as `.git` data from being uploaded as public assets.

After changing production web files:

1. commit to the repository,
2. wait for Cloudflare auto-deploy,
3. test the live domain rather than assuming the GitHub file equals the deployed state,
4. if the site appears stale, inspect the latest Cloudflare deployment before changing code again.

## 8. AP Cabinet Pro integration

New AP Cabinet Pro builds use the APcncDIY domain for browser-facing resources, including:

- login/recovery
- membership
- manual
- version checking

The plugin still uses the existing Supabase backend/database.

Current development line at the time this document was created:

- latest internal AP Cabinet Pro build: **2.1.190**
- legacy public release still associated with the old Gcode stack: **2.1.186**

Do not infer that an internal RBZ is already public. Verify GitHub Releases and `version.json` independently.

## 9. Release workflow (target architecture)

The intended new release flow is:

1. Build and test a new AP Cabinet Pro RBZ.
2. Create a GitHub Release in `Aphiphoom/APcncDIY`.
3. Upload the release RBZ asset.
4. Obtain the final GitHub asset download URL.
5. Update this repository's `version.json`:
   - `latest_version`
   - `file_name`
   - `download_url`
   - `release_url`
   - `notes`
   - `published_at`
6. Verify `https://apcncdiy.com/version.json` after Cloudflare deploy.
7. Verify the RBZ URL downloads successfully.
8. Do **not** update the legacy Gcode `version.json` unless explicitly intended for old clients.

At the time this README was created, the APcncDIY repository had not yet established its first GitHub Release. Always check current GitHub state before acting.

## 10. Web/plugin synchronization rule

Browser-facing files exist both on the web and, in some cases, inside AP Cabinet Pro packages.

When one of these changes materially, check whether the packaged plugin copy also needs the same update:

- `login.html`
- `admin.html`
- `admin.js`
- `membership.html`

Do not blindly copy whole files between the legacy Gcode repo, APcncDIY repo, and plugin package. Preserve domain-specific constants and APcncDIY-specific UI changes.

## 11. Supabase data / backend cautions

Before changing database/auth behavior:

- inspect current tables/functions first,
- preserve existing member IDs and profiles,
- do not migrate or recreate the database as part of a front-end task,
- do not expose service-role keys or secrets in this repository,
- public/publishable client configuration is stored in `config.js`; server secrets must remain outside Git.

The `cabinet-ai` Edge Function is part of the same Supabase project and is used by AP Cabinet Pro features. Domain migration should not casually alter it.

## 12. Agent checklist before making changes

An AI agent or new maintainer should follow this sequence:

1. Read `README.md` and `AGENTS.md`.
2. Inspect the current target files from the default branch; do not rely on old chat context.
3. Identify whether the change affects:
   - APcncDIY web only,
   - packaged AP Cabinet Pro UI,
   - legacy Gcode compatibility,
   - Supabase Auth/DB,
   - Cloudflare deployment,
   - GitHub Release/update flow.
4. Preserve legacy compatibility unless the user explicitly authorizes a breaking migration.
5. Make the smallest coherent change.
6. Test syntax and the relevant login/admin/mobile flow.
7. Verify deployed production behavior if the task is web-facing.
8. Update release metadata only when an actual release asset exists.

## 13. What must never be assumed

Do not assume:

- the newest internal plugin build is the public release,
- Cloudflare has deployed the latest commit,
- GitHub Release assets exist just because an RBZ exists in project storage,
- legacy GitHub Pages can be removed,
- Site URL and Redirect URLs in Supabase are interchangeable,
- a copied legacy page is safe for APcncDIY without checking its URLs and custom UI.

Verify each of these before changing production.

## 14. Project ownership / operating principle

Changes should be direct, minimal, and fully owned by the task being performed. Avoid speculative rewrites, unrelated refactors, or delegating core implementation unless explicitly requested.

When uncertain about a change that can break existing customers, stop and inspect the current production/legacy behavior before modifying it.
