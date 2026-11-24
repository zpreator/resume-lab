# Job Tracker API

Endpoints for the Job Tracker tab's data. Intended for both the app's own UI and an external
automated routine (e.g. a scheduled Claude process that reads your inbox and reports status
changes). Storage is flat JSON files in `data/jobs/`, one per application, matching the rest of
the app's conventions (see `lib/jobsStore.js`).

## Auth

The app does not authenticate requests itself: access is controlled in front of it by
**Cloudflare Access**, so these routes have no in-app login. Do not expose the app's port outside
a trusted network without an access layer in front of it.

- **Browser:** sign in through the Access login page.
- **Automated routine (e.g. the scheduled Claude process):** use an Access **Service Token**.
  Send its two values as headers on every request:

  ```
  CF-Access-Client-Id: <client id>
  CF-Access-Client-Secret: <client secret>
  ```

  Cloudflare checks them before the request reaches the app; a request without valid headers is
  redirected to the login page and never arrives. Create the token under Zero Trust > Access >
  Service Auth, then add a policy with action **Service Auth** that includes it on this
  application. Keep the secret in the routine's secret store (not a plain environment variable),
  give the token an expiry, and rotate it before then.

The routine only needs `/api/jobs`, `/api/jobs/upsert` and `/api/jobs/:id/status`. The rest of the
API (resume generation, which spends Anthropic credit, the knowledge base, and the resumes) is
behind the same gate, so treat the token as access to all of it.

All request/response bodies are JSON. Base URL is wherever the app is reachable (e.g.
`http://<host>:3000`).

## Enums

```
source: linkedin | indeed | company_site | recruiter_outreach | other
status: applied | recruiter_outreach | interviewing | interview_scheduled | offer | rejected | withdrawn | ghosted
```

## Job object shape

```json
{
  "id": "2026-08-10-acme-corp-staff-engineer",
  "company": "Acme Corp",
  "roleTitle": "Staff Engineer",
  "source": "linkedin",
  "status": "interview_scheduled",
  "appliedDate": "2026-08-01",
  "lastUpdated": "2026-08-10T14:22:00.000Z",
  "notes": "Recruiter mentioned a $180k-$200k band.",
  "sourceUrl": "https://www.linkedin.com/jobs/view/12345",
  "emailThreadRef": "18f2a9c0b3e4d5f6",
  "contactName": "Jane Recruiter",
  "contactInfo": "jane@acme.com",
  "createdAt": "2026-08-01T09:00:00.000Z",
  "statusHistory": [
    { "status": "applied", "changedAt": "2026-08-01T09:00:00.000Z", "note": null },
    { "status": "interview_scheduled", "changedAt": "2026-08-10T14:22:00.000Z", "note": "Phone screen booked for 8/14" }
  ]
}
```

## Endpoints

### `GET /api/jobs`

List applications, sorted by `lastUpdated` descending. Optional query params filter the result:

- `?status=interviewing`
- `?source=linkedin`

**Response:** `200` — array of job objects.

### `GET /api/jobs/:id`

Fetch a single application, including its full `statusHistory`.

**Response:** `200` — job object, or `404` if not found.

### `POST /api/jobs/upsert`

The main entry point for the automated routine. Creates a new application, or updates an
existing one if a match is found — so the routine can call this after parsing any job-related
email without first checking for duplicates itself.

**Matching order:**
1. `emailThreadRef` exact match, if provided.
2. Fallback: `company` + `roleTitle` + `source` (case-insensitive, trimmed).

If no match is found, a new record is created (`status` defaults to `applied`). If a match is
found, any provided fields overwrite the existing ones; if `status` is provided and differs from
the current status, a new entry is appended to `statusHistory` automatically (no need to also
call the status endpoint below).

**Request body:**

```json
{
  "company": "Acme Corp",
  "roleTitle": "Staff Engineer",
  "source": "linkedin",
  "status": "rejected",
  "note": "GE HealthCare - Image Quality Engineer marked rejected, auto-detected from rejection email",
  "appliedDate": "2026-08-01",
  "notes": "...",
  "sourceUrl": "https://...",
  "emailThreadRef": "18f2a9c0b3e4d5f6",
  "contactName": "Jane Recruiter",
  "contactInfo": "jane@acme.com"
}
```

`company`, `roleTitle`, and `source` are required. Everything else is optional — omit fields you
don't have rather than sending `null` guesses.

**Response:** `200`

```json
{ "job": { ...job object... }, "matched": true }
```

`matched` is `true` if an existing record was updated, `false` if a new one was created.

### `POST /api/jobs/:id/status`

Append a status change to a specific application's timeline (use this when the routine already
holds the job's `id`, e.g. from a prior `upsert` or `list` call).

**Request body:**

```json
{ "status": "interview_scheduled", "note": "Onsite loop booked for 8/20" }
```

`note` is optional. **Response:** `200` — updated job object, or `404` if not found.

### `POST /api/jobs`

Manual create (used by the UI's "Add application" form). Same required fields as `upsert`, but
never matches an existing record — always creates a new one.

**Response:** `201` — created job object.

### `PUT /api/jobs/:id`

Manual edit (used by the UI's "Edit" form). Accepts any subset of the editable fields
(`company`, `roleTitle`, `source`, `status`, `appliedDate`, `notes`, `sourceUrl`,
`emailThreadRef`, `contactName`, `contactInfo`, `note`). Changing `status` logs a timeline entry,
same as `upsert`.

**Response:** `200` — updated job object.

### `DELETE /api/jobs/:id`

Remove an application entirely (used by the UI; the automated routine has no reason to call
this). **Response:** `200` — `{ "deleted": true }`.

## Example: automated routine flow

```bash
# 1. Upsert what was found in an email (creates or updates + logs status change)
curl -X POST https://resumelab.puzzleshome.com/api/jobs/upsert \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "company": "GE HealthCare",
    "roleTitle": "Image Quality Engineer",
    "source": "company_site",
    "status": "rejected",
    "note": "Auto-detected from rejection email",
    "emailThreadRef": "18f2a9c0b3e4d5f6"
  }'

# 2. Optional: check current state before deciding something is a dup
curl "https://resumelab.puzzleshome.com/api/jobs?status=interviewing" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"
```
