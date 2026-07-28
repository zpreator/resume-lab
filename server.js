import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateResume, applyCorrection, analyzeKnowledge } from './lib/claude.js';
import { listDrafts, getDraft, createDraft, updateDraftContent, promoteDraft, getBaseResume } from './lib/store.js';
import { listKnowledge, createKnowledge, deleteKnowledge } from './lib/knowledgeStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Resume Lab running at http://localhost:${PORT} (and on your LAN IP for mobile)`);
});
