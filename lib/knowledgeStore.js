// Filesystem storage for knowledge snippets. Each entry is knowledge/<id>.json:
//   { id, rawText, summary, tags, company, dateContext, createdAt }
import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from './paths.js';

export const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge');

function makeId() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function listKnowledge() {
    await fs.mkdir(KNOWLEDGE_DIR, { recursive: true });
    const files = await fs.readdir(KNOWLEDGE_DIR);
    const entries = await Promise.all(
        files
            .filter((f) => f.endsWith('.json'))
            .map(async (f) => JSON.parse(await fs.readFile(path.join(KNOWLEDGE_DIR, f), 'utf8')))
    );
    entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return entries;
}

export async function createKnowledge({ rawText, summary, tags, company, dateContext }) {
    await fs.mkdir(KNOWLEDGE_DIR, { recursive: true });
    const id = makeId();
    const entry = { id, rawText, summary, tags, company, dateContext, createdAt: new Date().toISOString() };
    await fs.writeFile(path.join(KNOWLEDGE_DIR, `${id}.json`), JSON.stringify(entry, null, 2), 'utf8');
    return entry;
}

export async function deleteKnowledge(id) {
    await fs.unlink(path.join(KNOWLEDGE_DIR, `${id}.json`));
}
