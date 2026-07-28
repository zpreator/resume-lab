// Filesystem storage for resume drafts. Each draft is a pair of files:
//   resumes/<id>.md         - the resume markdown
//   resumes/<id>.meta.json  - { company, jobTitle, jobDescription, createdAt, updatedAt, corrections }
import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from './paths.js';

export const RESUMES_DIR = path.join(DATA_DIR, 'resumes');
export const BASE_RESUME_PATH = path.join(DATA_DIR, 'base-resume.md');

function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'company';
}

async function idExists(id) {
    try {
        await fs.access(path.join(RESUMES_DIR, `${id}.md`));
        return true;
    } catch {
        return false;
    }
}

async function makeId(company) {
    const date = new Date().toISOString().slice(0, 10);
    const base = `${date}-${slugify(company)}`;
    let id = base;
    let n = 2;
    while (await idExists(id)) {
        id = `${base}-${n}`;
        n += 1;
    }
    return id;
}

export async function getBaseResume() {
    return fs.readFile(BASE_RESUME_PATH, 'utf8');
}

export async function listDrafts() {
    await fs.mkdir(RESUMES_DIR, { recursive: true });
    const files = await fs.readdir(RESUMES_DIR);
    const ids = files.filter((f) => f.endsWith('.meta.json')).map((f) => f.replace(/\.meta\.json$/, ''));

    const drafts = await Promise.all(
        ids.map(async (id) => {
            const meta = JSON.parse(await fs.readFile(path.join(RESUMES_DIR, `${id}.meta.json`), 'utf8'));
            return { id, ...meta };
        })
    );

    drafts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return drafts;
}

export async function getDraft(id) {
    const [markdown, metaRaw] = await Promise.all([
        fs.readFile(path.join(RESUMES_DIR, `${id}.md`), 'utf8'),
        fs.readFile(path.join(RESUMES_DIR, `${id}.meta.json`), 'utf8')
    ]);
    return { id, markdown, ...JSON.parse(metaRaw) };
}

export async function createDraft({ company, jobTitle, jobDescription, resume }) {
    await fs.mkdir(RESUMES_DIR, { recursive: true });
    const id = await makeId(company);
    const now = new Date().toISOString();
    const meta = { company, jobTitle, jobDescription, createdAt: now, updatedAt: now, corrections: [] };

    await Promise.all([
        fs.writeFile(path.join(RESUMES_DIR, `${id}.md`), resume, 'utf8'),
        fs.writeFile(path.join(RESUMES_DIR, `${id}.meta.json`), JSON.stringify(meta, null, 2), 'utf8')
    ]);

    return { id, markdown: resume, ...meta };
}

export async function updateDraftContent(id, markdown, correctionInstruction) {
    const metaPath = path.join(RESUMES_DIR, `${id}.meta.json`);
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    meta.updatedAt = new Date().toISOString();
    if (correctionInstruction) {
        meta.corrections.push({ instruction: correctionInstruction, at: meta.updatedAt });
    }

    await Promise.all([
        fs.writeFile(path.join(RESUMES_DIR, `${id}.md`), markdown, 'utf8'),
        fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8')
    ]);

    return { id, markdown, ...meta };
}

export async function promoteDraft(id) {
    const markdown = await fs.readFile(path.join(RESUMES_DIR, `${id}.md`), 'utf8');
    await fs.writeFile(BASE_RESUME_PATH, markdown, 'utf8');
    return markdown;
}
