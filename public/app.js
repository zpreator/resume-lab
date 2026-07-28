import { parseResume } from './resume-parser.js';
import { renderResumePDF } from './pdf.js';

const jdInput = document.getElementById('jd-input');
const generateBtn = document.getElementById('generate-btn');
const generateStatus = document.getElementById('generate-status');
const draftList = document.getElementById('draft-list');
const detailPanel = document.getElementById('detail-panel');
const detailTitle = document.getElementById('detail-title');
const detailMeta = document.getElementById('detail-meta');
const pdfFrame = document.getElementById('pdf-frame');
const downloadBtn = document.getElementById('download-btn');
const promoteBtn = document.getElementById('promote-btn');
const correctionInput = document.getElementById('correction-input');
const correctBtn = document.getElementById('correct-btn');
const correctStatus = document.getElementById('correct-status');
const viewPreviewBtn = document.getElementById('view-preview-btn');
const viewEditBtn = document.getElementById('view-edit-btn');
const pdfWrap = document.getElementById('pdf-wrap');
const editWrap = document.getElementById('edit-wrap');
const markdownEdit = document.getElementById('markdown-edit');
const saveMarkdownBtn = document.getElementById('save-markdown-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const knowledgeInput = document.getElementById('knowledge-input');
const knowledgeAddBtn = document.getElementById('knowledge-add-btn');
const knowledgeStatus = document.getElementById('knowledge-status');
const knowledgeList = document.getElementById('knowledge-list');

let currentDoc = null;
let currentDraft = null;

async function fetchJSON(url, options) {
    const res = await fetch(url, options);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Request failed');
    return body;
}

function formatDate(iso) {
    return new Date(iso).toLocaleString();
}

async function loadDraftList(selectId) {
    const drafts = await fetchJSON('/api/resumes');
    draftList.innerHTML = '';
    drafts.forEach((d) => {
        const li = document.createElement('li');
        li.className = 'draft-item' + (d.id === selectId ? ' active' : '');
        li.innerHTML = `<strong>${d.company}</strong><span>${d.jobTitle}</span><time>${formatDate(d.updatedAt)}</time>`;
        li.addEventListener('click', () => selectDraft(d.id));
        draftList.appendChild(li);
    });
}

function renderPreview(markdown) {
    const parsed = parseResume(markdown);
    currentDoc = renderResumePDF(parsed);
    pdfFrame.src = currentDoc.output('bloburl');
}

function setViewMode(mode) {
    const isEdit = mode === 'edit';
    pdfWrap.hidden = isEdit;
    editWrap.hidden = !isEdit;
    viewPreviewBtn.classList.toggle('active', !isEdit);
    viewEditBtn.classList.toggle('active', isEdit);
    if (isEdit && currentDraft) markdownEdit.value = currentDraft.markdown;
}

viewPreviewBtn.addEventListener('click', () => setViewMode('preview'));
viewEditBtn.addEventListener('click', () => setViewMode('edit'));
cancelEditBtn.addEventListener('click', () => setViewMode('preview'));

saveMarkdownBtn.addEventListener('click', async () => {
    const markdown = markdownEdit.value.trim();
    if (!markdown || !currentDraft) return;
    saveMarkdownBtn.disabled = true;
    try {
        currentDraft = await fetchJSON(`/api/resumes/${currentDraft.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markdown })
        });
        renderPreview(currentDraft.markdown);
        detailMeta.textContent = `Updated ${formatDate(currentDraft.updatedAt)} • ${currentDraft.corrections.length} correction(s)`;
        setViewMode('preview');
        await loadDraftList(currentDraft.id);
    } catch (err) {
        alert(`Error: ${err.message}`);
    } finally {
        saveMarkdownBtn.disabled = false;
    }
});

async function selectDraft(id) {
    currentDraft = await fetchJSON(`/api/resumes/${id}`);
    detailTitle.textContent = `${currentDraft.company} — ${currentDraft.jobTitle}`;
    detailMeta.textContent = `Updated ${formatDate(currentDraft.updatedAt)} • ${currentDraft.corrections.length} correction(s)`;
    detailPanel.hidden = false;
    setViewMode('preview');
    renderPreview(currentDraft.markdown);
    correctionInput.value = '';
    correctStatus.textContent = '';
    await loadDraftList(id);
    detailPanel.scrollIntoView({ behavior: 'smooth' });
}

generateBtn.addEventListener('click', async () => {
    const jobDescription = jdInput.value.trim();
    if (!jobDescription) {
        generateStatus.textContent = 'Paste a job description first.';
        return;
    }
    generateBtn.disabled = true;
    generateStatus.textContent = 'Generating with Claude…';
    try {
        const draft = await fetchJSON('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobDescription })
        });
        generateStatus.textContent = `Created draft for ${draft.company}.`;
        jdInput.value = '';
        await selectDraft(draft.id);
    } catch (err) {
        generateStatus.textContent = `Error: ${err.message}`;
    } finally {
        generateBtn.disabled = false;
    }
});

correctBtn.addEventListener('click', async () => {
    const instruction = correctionInput.value.trim();
    if (!instruction || !currentDraft) return;
    correctBtn.disabled = true;
    correctStatus.textContent = 'Applying correction…';
    try {
        currentDraft = await fetchJSON(`/api/resumes/${currentDraft.id}/correct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instruction })
        });
        renderPreview(currentDraft.markdown);
        detailMeta.textContent = `Updated ${formatDate(currentDraft.updatedAt)} • ${currentDraft.corrections.length} correction(s)`;
        correctionInput.value = '';
        correctStatus.textContent = 'Applied.';
        await loadDraftList(currentDraft.id);
    } catch (err) {
        correctStatus.textContent = `Error: ${err.message}`;
    } finally {
        correctBtn.disabled = false;
    }
});

downloadBtn.addEventListener('click', () => {
    if (!currentDoc || !currentDraft) return;
    currentDoc.save(`${currentDraft.company}-resume.pdf`.replace(/\s+/g, '_'));
});

promoteBtn.addEventListener('click', async () => {
    if (!currentDraft) return;
    if (!confirm(`Promote the ${currentDraft.company} draft to base-resume.md?`)) return;
    try {
        await fetchJSON(`/api/resumes/${currentDraft.id}/promote`, { method: 'POST' });
        detailMeta.textContent += ' • Promoted to base resume';
    } catch (err) {
        alert(`Error: ${err.message}`);
    }
});

async function loadKnowledge() {
    const entries = await fetchJSON('/api/knowledge');
    knowledgeList.innerHTML = '';
    entries.forEach((entry) => {
        const li = document.createElement('li');
        li.className = 'knowledge-item';
        const meta = [entry.company, entry.dateContext].filter(Boolean).join(' • ');
        const tags = (entry.tags || []).map((t) => `<span class="tag">${t}</span>`).join('');
        li.innerHTML = `
            <p>${entry.summary}</p>
            <div class="knowledge-meta">${meta ? `<span>${meta}</span>` : ''}<time>${formatDate(entry.createdAt)}</time></div>
            <div class="tags">${tags}</div>
            <button class="secondary knowledge-delete">Delete</button>
        `;
        li.querySelector('.knowledge-delete').addEventListener('click', async () => {
            if (!confirm('Delete this knowledge entry?')) return;
            await fetchJSON(`/api/knowledge/${entry.id}`, { method: 'DELETE' });
            await loadKnowledge();
        });
        knowledgeList.appendChild(li);
    });
}

knowledgeAddBtn.addEventListener('click', async () => {
    const text = knowledgeInput.value.trim();
    if (!text) {
        knowledgeStatus.textContent = 'Write a sentence or two first.';
        return;
    }
    knowledgeAddBtn.disabled = true;
    knowledgeStatus.textContent = 'Analyzing…';
    try {
        await fetchJSON('/api/knowledge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        knowledgeInput.value = '';
        knowledgeStatus.textContent = 'Added.';
        await loadKnowledge();
    } catch (err) {
        knowledgeStatus.textContent = `Error: ${err.message}`;
    } finally {
        knowledgeAddBtn.disabled = false;
    }
});

loadDraftList();
loadKnowledge();
