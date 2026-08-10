// Job Tracker tab: table view, manual add/edit, and status timeline.
// Talks to the same /api/jobs endpoints the external inbox-parsing routine uses.

const SOURCES = [
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'indeed', label: 'Indeed' },
    { value: 'company_site', label: 'Company site' },
    { value: 'recruiter_outreach', label: 'Recruiter outreach' },
    { value: 'other', label: 'Other' }
];

const STATUSES = [
    { value: 'applied', label: 'Applied' },
    { value: 'recruiter_outreach', label: 'Recruiter outreach' },
    { value: 'interviewing', label: 'Interviewing' },
    { value: 'interview_scheduled', label: 'Interview scheduled' },
    { value: 'offer', label: 'Offer' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'withdrawn', label: 'Withdrawn' },
    { value: 'ghosted', label: 'Ghosted' }
];

const STALE_DAYS = 14;
const STALE_ELIGIBLE_STATUSES = new Set(['applied', 'recruiter_outreach', 'interviewing', 'interview_scheduled']);

function statusLabel(value) {
    return STATUSES.find((s) => s.value === value)?.label || value;
}

function sourceLabel(value) {
    return SOURCES.find((s) => s.value === value)?.label || value;
}

// Tab switching
const tabBtnResume = document.getElementById('tab-btn-resume');
const tabBtnJobs = document.getElementById('tab-btn-jobs');
const tabResume = document.getElementById('tab-resume');
const tabJobs = document.getElementById('tab-jobs');

function setActiveTab(tab) {
    const isJobs = tab === 'jobs';
    tabResume.hidden = isJobs;
    tabJobs.hidden = !isJobs;
    tabBtnResume.classList.toggle('active', !isJobs);
    tabBtnJobs.classList.toggle('active', isJobs);
    if (isJobs) loadJobs();
}

tabBtnResume.addEventListener('click', () => setActiveTab('resume'));
tabBtnJobs.addEventListener('click', () => setActiveTab('jobs'));

// DOM refs
const filterStatus = document.getElementById('jobs-filter-status');
const filterSource = document.getElementById('jobs-filter-source');
const jobsAddBtn = document.getElementById('jobs-add-btn');
const jobsTableBody = document.getElementById('jobs-table-body');
const jobsEmpty = document.getElementById('jobs-empty');

const jobDetailPanel = document.getElementById('job-detail-panel');
const jobDetailTitle = document.getElementById('job-detail-title');
const jobDetailMeta = document.getElementById('job-detail-meta');
const jobDetailSource = document.getElementById('job-detail-source');
const jobDetailApplied = document.getElementById('job-detail-applied');
const jobDetailContact = document.getElementById('job-detail-contact');
const jobDetailUrl = document.getElementById('job-detail-url');
const jobDetailThread = document.getElementById('job-detail-thread');
const jobDetailNotes = document.getElementById('job-detail-notes');
const jobTimeline = document.getElementById('job-timeline');
const jobEditBtn = document.getElementById('job-edit-btn');
const jobDeleteBtn = document.getElementById('job-delete-btn');
const jobCloseBtn = document.getElementById('job-close-btn');
const jobStatusAddSelect = document.getElementById('job-status-add-select');
const jobStatusAddNote = document.getElementById('job-status-add-note');
const jobStatusAddBtn = document.getElementById('job-status-add-btn');

const jobFormPanel = document.getElementById('job-form-panel');
const jobFormTitle = document.getElementById('job-form-title');
const jobForm = document.getElementById('job-form');
const jobFormCompany = document.getElementById('job-form-company');
const jobFormRole = document.getElementById('job-form-role');
const jobFormSource = document.getElementById('job-form-source');
const jobFormStatus = document.getElementById('job-form-status');
const jobFormAppliedDate = document.getElementById('job-form-applied-date');
const jobFormUrl = document.getElementById('job-form-url');
const jobFormContactName = document.getElementById('job-form-contact-name');
const jobFormContactInfo = document.getElementById('job-form-contact-info');
const jobFormThread = document.getElementById('job-form-thread');
const jobFormNotes = document.getElementById('job-form-notes');
const jobFormCancelBtn = document.getElementById('job-form-cancel-btn');
const jobFormStatusMsg = document.getElementById('job-form-status-msg');

let jobs = [];
let currentJob = null;
let editingId = null;

async function fetchJSON(url, options) {
    const res = await fetch(url, options);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Request failed');
    return body;
}

function formatDate(iso) {
    return iso ? new Date(iso).toLocaleString() : '—';
}

function daysSince(iso) {
    return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

function populateSelect(select, options, withBlank) {
    select.innerHTML = (withBlank ? [{ value: '', label: withBlank }] : []).concat(options)
        .map((o) => `<option value="${o.value}">${o.label}</option>`)
        .join('');
}

populateSelect(filterStatus, STATUSES, 'All statuses');
populateSelect(filterSource, SOURCES, 'All sources');
populateSelect(jobFormSource, SOURCES);
populateSelect(jobFormStatus, STATUSES);
populateSelect(jobStatusAddSelect, STATUSES);

function rowHighlightClass(job) {
    if (job.status === 'interview_scheduled') return 'row-interview';
    if (STALE_ELIGIBLE_STATUSES.has(job.status) && daysSince(job.lastUpdated) >= STALE_DAYS) return 'row-stale';
    return '';
}

function renderTable() {
    jobsTableBody.innerHTML = '';
    jobsEmpty.hidden = jobs.length > 0;
    jobs.forEach((job) => {
        const tr = document.createElement('tr');
        tr.className = rowHighlightClass(job);
        tr.innerHTML = `
            <td>${job.company}</td>
            <td>${job.roleTitle}</td>
            <td>${sourceLabel(job.source)}</td>
            <td><span class="status-badge status-${job.status}">${statusLabel(job.status)}</span></td>
            <td>${job.appliedDate || '—'}</td>
            <td>${formatDate(job.lastUpdated)}</td>
        `;
        tr.addEventListener('click', () => selectJob(job.id));
        jobsTableBody.appendChild(tr);
    });
}

async function loadJobs() {
    const params = new URLSearchParams();
    if (filterStatus.value) params.set('status', filterStatus.value);
    if (filterSource.value) params.set('source', filterSource.value);
    jobs = await fetchJSON(`/api/jobs?${params.toString()}`);
    renderTable();
}

filterStatus.addEventListener('change', loadJobs);
filterSource.addEventListener('change', loadJobs);

function renderTimeline(job) {
    jobTimeline.innerHTML = '';
    [...job.statusHistory].reverse().forEach((event) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="status-badge status-${event.status}">${statusLabel(event.status)}</span>
            <time>${formatDate(event.changedAt)}</time>
            ${event.note ? `<p>${event.note}</p>` : ''}
        `;
        jobTimeline.appendChild(li);
    });
}

async function selectJob(id) {
    try {
        currentJob = await fetchJSON(`/api/jobs/${id}`);
    } catch (err) {
        alert(`Error loading application: ${err.message}`);
        return;
    }
    jobFormPanel.hidden = true;
    jobDetailTitle.textContent = `${currentJob.company} — ${currentJob.roleTitle}`;
    jobDetailMeta.textContent = `Last updated ${formatDate(currentJob.lastUpdated)}`;
    jobDetailSource.textContent = sourceLabel(currentJob.source);
    jobDetailApplied.textContent = currentJob.appliedDate || '—';
    jobDetailContact.textContent = [currentJob.contactName, currentJob.contactInfo].filter(Boolean).join(' • ') || '—';
    if (currentJob.sourceUrl) {
        jobDetailUrl.innerHTML = `<a href="${currentJob.sourceUrl}" target="_blank" rel="noopener">${currentJob.sourceUrl}</a>`;
    } else {
        jobDetailUrl.textContent = '—';
    }
    jobDetailThread.textContent = currentJob.emailThreadRef || '—';
    jobDetailNotes.textContent = currentJob.notes || '—';
    renderTimeline(currentJob);
    jobStatusAddSelect.value = currentJob.status;
    jobStatusAddNote.value = '';
    jobDetailPanel.hidden = false;
    jobDetailPanel.scrollIntoView({ behavior: 'smooth' });
}

jobCloseBtn.addEventListener('click', () => {
    jobDetailPanel.hidden = true;
    currentJob = null;
});

jobDeleteBtn.addEventListener('click', async () => {
    if (!currentJob) return;
    if (!confirm(`Delete the ${currentJob.company} application? This can't be undone.`)) return;
    await fetchJSON(`/api/jobs/${currentJob.id}`, { method: 'DELETE' });
    jobDetailPanel.hidden = true;
    currentJob = null;
    await loadJobs();
});

jobStatusAddBtn.addEventListener('click', async () => {
    if (!currentJob) return;
    jobStatusAddBtn.disabled = true;
    try {
        currentJob = await fetchJSON(`/api/jobs/${currentJob.id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: jobStatusAddSelect.value, note: jobStatusAddNote.value.trim() || undefined })
        });
        renderTimeline(currentJob);
        jobDetailMeta.textContent = `Last updated ${formatDate(currentJob.lastUpdated)}`;
        jobStatusAddNote.value = '';
        await loadJobs();
    } catch (err) {
        alert(`Error: ${err.message}`);
    } finally {
        jobStatusAddBtn.disabled = false;
    }
});

function resetForm() {
    jobForm.reset();
    jobFormStatus.value = 'applied';
    jobFormStatusMsg.textContent = '';
}

jobsAddBtn.addEventListener('click', () => {
    editingId = null;
    jobDetailPanel.hidden = true;
    jobFormTitle.textContent = 'Add application';
    resetForm();
    jobFormPanel.hidden = false;
    jobFormPanel.scrollIntoView({ behavior: 'smooth' });
});

jobEditBtn.addEventListener('click', () => {
    if (!currentJob) return;
    editingId = currentJob.id;
    jobFormTitle.textContent = 'Edit application';
    jobFormCompany.value = currentJob.company || '';
    jobFormRole.value = currentJob.roleTitle || '';
    jobFormSource.value = currentJob.source || '';
    jobFormStatus.value = currentJob.status || 'applied';
    jobFormAppliedDate.value = currentJob.appliedDate || '';
    jobFormUrl.value = currentJob.sourceUrl || '';
    jobFormContactName.value = currentJob.contactName || '';
    jobFormContactInfo.value = currentJob.contactInfo || '';
    jobFormThread.value = currentJob.emailThreadRef || '';
    jobFormNotes.value = currentJob.notes || '';
    jobFormStatusMsg.textContent = '';
    jobFormPanel.hidden = false;
    jobFormPanel.scrollIntoView({ behavior: 'smooth' });
});

jobFormCancelBtn.addEventListener('click', () => {
    jobFormPanel.hidden = true;
});

jobForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        company: jobFormCompany.value.trim(),
        roleTitle: jobFormRole.value.trim(),
        source: jobFormSource.value,
        status: jobFormStatus.value,
        appliedDate: jobFormAppliedDate.value || null,
        sourceUrl: jobFormUrl.value.trim() || null,
        contactName: jobFormContactName.value.trim() || null,
        contactInfo: jobFormContactInfo.value.trim() || null,
        emailThreadRef: jobFormThread.value.trim() || null,
        notes: jobFormNotes.value.trim()
    };
    jobFormStatusMsg.textContent = 'Saving…';
    try {
        if (editingId) {
            await fetchJSON(`/api/jobs/${editingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            await fetchJSON('/api/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        jobFormPanel.hidden = true;
        await loadJobs();
        if (editingId) await selectJob(editingId);
    } catch (err) {
        jobFormStatusMsg.textContent = `Error: ${err.message}`;
    }
});
