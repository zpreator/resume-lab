// Filesystem storage for job applications. Each application is jobs/<id>.json:
//   { id, company, roleTitle, source, status, appliedDate, lastUpdated, notes,
//     sourceUrl, emailThreadRef, contactName, contactInfo, createdAt, statusHistory }
// statusHistory is the timeline log: [{ status, changedAt, note }]
import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from './paths.js';

export const JOBS_DIR = path.join(DATA_DIR, 'jobs');

export const SOURCES = ['linkedin', 'indeed', 'company_site', 'recruiter_outreach', 'other'];
export const STATUSES = [
    'applied',
    'recruiter_outreach',
    'interviewing',
    'interview_scheduled',
    'offer',
    'rejected',
    'withdrawn',
    'ghosted'
];

function slugify(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'na';
}

function normalize(text) {
    return (text || '').trim().toLowerCase();
}

async function idExists(id) {
    try {
        await fs.access(path.join(JOBS_DIR, `${id}.json`));
        return true;
    } catch {
        return false;
    }
}

async function makeId(company, roleTitle) {
    const date = new Date().toISOString().slice(0, 10);
    const base = `${date}-${slugify(company)}-${slugify(roleTitle)}`;
    let id = base;
    let n = 2;
    while (await idExists(id)) {
        id = `${base}-${n}`;
        n += 1;
    }
    return id;
}

async function readJob(id) {
    const raw = await fs.readFile(path.join(JOBS_DIR, `${id}.json`), 'utf8');
    return JSON.parse(raw);
}

async function writeJob(job) {
    await fs.writeFile(path.join(JOBS_DIR, `${job.id}.json`), JSON.stringify(job, null, 2), 'utf8');
    return job;
}

export async function listJobs() {
    await fs.mkdir(JOBS_DIR, { recursive: true });
    const files = await fs.readdir(JOBS_DIR);
    const ids = files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
    const jobs = await Promise.all(ids.map(readJob));
    jobs.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
    return jobs;
}

export async function getJob(id) {
    return readJob(id);
}

async function findByThreadRef(emailThreadRef) {
    if (!emailThreadRef) return null;
    const jobs = await listJobs();
    return jobs.find((j) => j.emailThreadRef === emailThreadRef) || null;
}

async function findByCompanyRoleSource(company, roleTitle, source) {
    const jobs = await listJobs();
    return (
        jobs.find(
            (j) =>
                normalize(j.company) === normalize(company) &&
                normalize(j.roleTitle) === normalize(roleTitle) &&
                normalize(j.source) === normalize(source)
        ) || null
    );
}

export async function findMatchingJob({ emailThreadRef, company, roleTitle, source }) {
    return (await findByThreadRef(emailThreadRef)) || findByCompanyRoleSource(company, roleTitle, source);
}

export async function createJob(fields) {
    await fs.mkdir(JOBS_DIR, { recursive: true });
    const now = new Date().toISOString();
    const id = await makeId(fields.company, fields.roleTitle);
    const status = fields.status || 'applied';
    const job = {
        id,
        company: fields.company,
        roleTitle: fields.roleTitle,
        source: fields.source,
        status,
        appliedDate: fields.appliedDate || null,
        lastUpdated: now,
        notes: fields.notes || '',
        sourceUrl: fields.sourceUrl || null,
        emailThreadRef: fields.emailThreadRef || null,
        contactName: fields.contactName || null,
        contactInfo: fields.contactInfo || null,
        createdAt: now,
        statusHistory: [{ status, changedAt: now, note: fields.note || null }]
    };
    return writeJob(job);
}

const EDITABLE_FIELDS = [
    'company',
    'roleTitle',
    'source',
    'appliedDate',
    'notes',
    'sourceUrl',
    'emailThreadRef',
    'contactName',
    'contactInfo'
];

export async function updateJob(id, fields) {
    const job = await readJob(id);
    for (const key of EDITABLE_FIELDS) {
        if (fields[key] !== undefined) job[key] = fields[key];
    }
    job.lastUpdated = new Date().toISOString();
    if (fields.status && fields.status !== job.status) {
        job.status = fields.status;
        job.statusHistory.push({ status: fields.status, changedAt: job.lastUpdated, note: fields.note || null });
    }
    return writeJob(job);
}

export async function appendStatusEvent(id, status, note) {
    const job = await readJob(id);
    job.status = status;
    job.lastUpdated = new Date().toISOString();
    job.statusHistory.push({ status, changedAt: job.lastUpdated, note: note || null });
    return writeJob(job);
}

export async function upsertJob(fields) {
    const existing = await findMatchingJob(fields);
    if (!existing) {
        const job = await createJob(fields);
        return { job, matched: false };
    }
    const job = await updateJob(existing.id, fields);
    return { job, matched: true };
}

export async function deleteJob(id) {
    await fs.unlink(path.join(JOBS_DIR, `${id}.json`));
}
