# Resume Lab

Local tool with two tabs:

- **Resume** — paste a job description, get a Claude-tailored resume, submit corrections in plain English, preview and download the PDF, and promote a draft to `base-resume.md`.
- **Job Tracker** — a table of every application you have out, with a status timeline per application. Meant to be kept up to date by an external automated routine (e.g. a scheduled Claude process reading your inbox) via the API documented in [`docs/job-tracker-api.md`](docs/job-tracker-api.md), plus manual add/edit for anything that doesn't come in cleanly by email.

MVP — runs on your machine, protected by a single shared login. Storage is flat JSON files in `data/`.

## Setup

All personal data (your base resume, generated drafts, knowledge snippets) lives in `data/`, which is gitignored — the repo itself ships no personal information, so it's safe to fork/clone/distribute.

### Run locally

```bash
npm install
cp .env.example .env                          # then set ANTHROPIC_API_KEY
cp data/base-resume.example.md data/base-resume.md   # then fill in your own resume
npm start
```

Open `http://localhost:3000`. To use it from your phone on the same wifi, find your computer's LAN IP (e.g. `ipconfig getifaddr en0` on macOS) and open `http://<that-ip>:3000` instead.

### Run with Docker

```bash
cp .env.example .env
cp data/base-resume.example.md data/base-resume.md   # then fill in your own resume
docker compose up --build
```

`./data` is bind-mounted into the container at `/app/data`, so your resume, drafts, and knowledge base live on the host and survive rebuilds/updates. The image itself contains no personal data.

## How it works

- `data/base-resume.md` is the master resume (every job/bullet/skill) used as the source Claude tailors from. Not committed — copy it from `data/base-resume.example.md` and fill in your own details.
- `POST /api/generate` sends `data/base-resume.md` + a pasted job description to Claude (`claude-sonnet-5`), which returns a tailored resume plus the company name and job title, saved to `data/resumes/<date>-<company>.md`.
- `POST /api/resumes/:id/correct` sends the current draft + a free-text instruction to Claude, which returns the corrected markdown.
- `PUT /api/resumes/:id` saves a manually-edited markdown draft directly, no LLM call.
- `POST /api/resumes/:id/promote` overwrites `data/base-resume.md` with a draft.
- `POST /api/knowledge` takes a raw freeform note about something you did at work, has Claude tag it (summary, skills, company, timeframe), and stores it in `data/knowledge/`. `generateResume` includes all knowledge entries alongside the base resume so tailored drafts can pull from accomplishments not yet folded into the master resume.
- The PDF preview/download reuses the exact parser (`public/resume-parser.js`) and renderer (`public/pdf.js`) logic from the portfolio site, copied here so this tool stays self-contained if it's later split into its own repo.
- `data/jobs/<id>.json` holds one job application each, including its full status-change timeline (`lib/jobsStore.js`). The `/api/jobs*` endpoints (documented in [`docs/job-tracker-api.md`](docs/job-tracker-api.md)) back both the Job Tracker tab and an external automated routine — the routine authenticates with a bearer token (`JOB_TRACKER_API_KEY`) instead of the browser's Basic Auth login.
- The Job Tracker table highlights rows amber if they've had no `lastUpdated` movement in 14+ days (and aren't already in a terminal status), and highlights `interview_scheduled` rows in accent color.

## Out of scope (MVP)

No cover letters, whole-file resume promote only (no section-level merge), no kanban view for the job tracker (table only for now).
