import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateResume, applyCorrection, analyzeKnowledge } from './lib/claude.js';
import { listDrafts, getDraft, createDraft, updateDraftContent, promoteDraft, getBaseResume } from './lib/store.js';
import { listKnowledge, createKnowledge, deleteKnowledge } from './lib/knowledgeStore.js';
import {
    listJobs,
    getJob,
    createJob,
    updateJob,
    upsertJob,
    appendStatusEvent,
    deleteJob,
    SOURCES,
    STATUSES
} from './lib/jobsStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_USERNAME = process.env.USERNAME || 'admin';
const AUTH_PASSWORD = process.env.PASSWORD || 'admin';
const JOB_TRACKER_API_KEY = process.env.JOB_TRACKER_API_KEY || '';

function timingSafeEqual(a, b) {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

// Two ways in: a browser session (HTTP Basic Auth) or an automated routine
// bearing the job-tracker API key (Authorization: Bearer <key>).
function basicAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, credential] = header.split(' ');

    if (scheme === 'Bearer' && JOB_TRACKER_API_KEY && credential) {
        if (timingSafeEqual(credential, JOB_TRACKER_API_KEY)) return next();
    }

    if (scheme === 'Basic' && credential) {
        const [user, pass] = Buffer.from(credential, 'base64').toString('utf8').split(':');
        if (timingSafeEqual(user || '', AUTH_USERNAME) && timingSafeEqual(pass || '', AUTH_PASSWORD)) {
            return next();
        }
    }

    res.set('WWW-Authenticate', 'Basic realm="Resume Lab"');
    res.status(401).json({ error: 'Authentication required' });
}

app.use(basicAuth);
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/base', async (req, res) => {
    try {
        res.type('text/markdown').send(await getBaseResume());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/resumes', async (req, res) => {
    try {
        res.json(await listDrafts());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/resumes/:id', async (req, res) => {
    try {
        res.json(await getDraft(req.params.id));
    } catch (err) {
        res.status(404).json({ error: 'Draft not found' });
    }
});

app.post('/api/generate', async (req, res) => {
    const { jobDescription } = req.body;
    if (!jobDescription || !jobDescription.trim()) {
        return res.status(400).json({ error: 'jobDescription is required' });
    }
    try {
        const baseResumeMd = await getBaseResume();
        const knowledgeEntries = await listKnowledge();
        const { company, jobTitle, resume } = await generateResume(baseResumeMd, jobDescription, knowledgeEntries);
        const draft = await createDraft({ company, jobTitle, jobDescription, resume });
        res.json(draft);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/knowledge', async (req, res) => {
    try {
        res.json(await listKnowledge());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/knowledge', async (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim()) {
        return res.status(400).json({ error: 'text is required' });
    }
    try {
        const analyzed = await analyzeKnowledge(text);
        const entry = await createKnowledge({ rawText: text, ...analyzed });
        res.json(entry);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/knowledge/:id', async (req, res) => {
    try {
        await deleteKnowledge(req.params.id);
        res.json({ deleted: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/resumes/:id', async (req, res) => {
    const { markdown } = req.body;
    if (!markdown || !markdown.trim()) {
        return res.status(400).json({ error: 'markdown is required' });
    }
    try {
        const updated = await updateDraftContent(req.params.id, markdown);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/resumes/:id/correct', async (req, res) => {
    const { instruction } = req.body;
    if (!instruction || !instruction.trim()) {
        return res.status(400).json({ error: 'instruction is required' });
    }
    try {
        const draft = await getDraft(req.params.id);
        const corrected = await applyCorrection(draft.markdown, instruction);
        const updated = await updateDraftContent(req.params.id, corrected, instruction);
        res.json(updated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/resumes/:id/promote', async (req, res) => {
    try {
        const markdown = await promoteDraft(req.params.id);
        res.json({ promoted: true, markdown });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function parseJobBody(body) {
    const { company, roleTitle, source, status, appliedDate, notes, sourceUrl, emailThreadRef, contactName, contactInfo, note } = body;
    if (source !== undefined && !SOURCES.includes(source)) {
        throw new Error(`source must be one of: ${SOURCES.join(', ')}`);
    }
    if (status !== undefined && !STATUSES.includes(status)) {
        throw new Error(`status must be one of: ${STATUSES.join(', ')}`);
    }
    return { company, roleTitle, source, status, appliedDate, notes, sourceUrl, emailThreadRef, contactName, contactInfo, note };
}

app.get('/api/jobs', async (req, res) => {
    try {
        let jobs = await listJobs();
        const { status, source } = req.query;
        if (status) jobs = jobs.filter((j) => j.status === status);
        if (source) jobs = jobs.filter((j) => j.source === source);
        res.json(jobs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/jobs/:id', async (req, res) => {
    try {
        res.json(await getJob(req.params.id));
    } catch (err) {
        res.status(404).json({ error: 'Job application not found' });
    }
});

app.post('/api/jobs', async (req, res) => {
    try {
        const fields = parseJobBody(req.body);
        if (!fields.company || !fields.roleTitle || !fields.source) {
            return res.status(400).json({ error: 'company, roleTitle, and source are required' });
        }
        res.status(201).json(await createJob(fields));
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/jobs/:id', async (req, res) => {
    try {
        const fields = parseJobBody(req.body);
        res.json(await updateJob(req.params.id, fields));
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/jobs/:id', async (req, res) => {
    try {
        await deleteJob(req.params.id);
        res.json({ deleted: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upsert for the automated inbox-parsing routine: matches on emailThreadRef
// first, falling back to company+roleTitle+source. Creates if no match found.
app.post('/api/jobs/upsert', async (req, res) => {
    try {
        const fields = parseJobBody(req.body);
        if (!fields.company || !fields.roleTitle || !fields.source) {
            return res.status(400).json({ error: 'company, roleTitle, and source are required' });
        }
        const { job, matched } = await upsertJob(fields);
        res.json({ job, matched });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/jobs/:id/status', async (req, res) => {
    const { status, note } = req.body;
    if (!status || !STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    }
    try {
        res.json(await appendStatusEvent(req.params.id, status, note));
    } catch (err) {
        res.status(404).json({ error: 'Job application not found' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Resume Lab running at http://localhost:${PORT} (and on your LAN IP for mobile)`);
});
