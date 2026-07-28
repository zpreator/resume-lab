// Anthropic API wrapper for the two resume-lab transforms:
// generateResume() tailors the master resume to a job description, returning
// structured metadata (company/jobTitle) alongside the markdown in one call.
// applyCorrection() rewrites an existing resume markdown per a free-text instruction.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-5';

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// The exact markdown contract resume-parser.js depends on (see zpreator.github.io/resume-parser.js).
const FORMAT_CONTRACT = `The resume markdown MUST follow this exact structure (the renderer parses it with regexes, so do not deviate):

# Full Name

**Title**

📧 Email: [text](mailto:...)
🔗 LinkedIn: [text](url)
🐙 GitHub: [text](url)
🌐 Portfolio: [text](url)
📍 Location: City, State

## Summary

One paragraph, no blank line inside it.

## Experience

**Org, Role**, City, State - *Start Month Year - End Month Year or Present*
- Bullet
- Bullet

(repeat per job, most recent first)

## Education

**School**, City, State - *Start - End*
- Degree - Emphasis/Details • GPA: X.XX

## Projects

**Project Name**, *Year or date range*
- Bullet
- Technologies: comma, separated, list

## Technical Skills

**Category:** comma, separated, items
**Category:** comma, separated, items

Rules:
- Every section header is "## Name" exactly as above (Experience, Education, Projects, Technical Skills).
- Entry headers are "**Bold Title**, subtitle - *sub-subtitle*" (subtitle/dash are optional, but the trailing "*...*" date/year is required).
- Bullets are markdown "- " lines. Technical Skills entries are single inline lines, not bulleted.
- Do not add commentary, headings, or code fences outside this structure.`;

function stripCodeFence(text) {
    const trimmed = text.trim();
    const fenced = trimmed.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/);
    return fenced ? fenced[1] : trimmed;
}

function formatKnowledgeBlock(knowledgeEntries) {
    if (!knowledgeEntries || !knowledgeEntries.length) return '';
    const lines = knowledgeEntries.map((k) => {
        const context = [k.company, k.dateContext].filter(Boolean).join(', ');
        const tagStr = k.tags && k.tags.length ? ` (tags: ${k.tags.join(', ')})` : '';
        return `- ${context ? `[${context}] ` : ''}${k.summary}${tagStr}`;
    });
    return `\n\nADDITIONAL EXPERIENCE NOTES (accomplishments not yet folded into the master resume — pull from these too if relevant to this job):\n${lines.join('\n')}`;
}

/**
 * Tailor the master resume to a job description.
 * @param {string} baseResumeMd - the full "master" resume markdown
 * @param {string} jobDescription - pasted job description text
 * @param {Array<{summary: string, tags: string[], company: string, dateContext: string}>} [knowledgeEntries] - extra accomplishments not yet in the master resume
 * @returns {Promise<{company: string, jobTitle: string, resume: string}>}
 */
export async function generateResume(baseResumeMd, jobDescription, knowledgeEntries = []) {
    const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        output_config: {
            effort: 'medium',
            format: {
                type: 'json_schema',
                schema: {
                    type: 'object',
                    properties: {
                        company: { type: 'string', description: 'Hiring company name, extracted from the job description' },
                        jobTitle: { type: 'string', description: 'Job title, extracted from the job description' },
                        resume: { type: 'string', description: 'The tailored resume, as markdown matching the format contract' }
                    },
                    required: ['company', 'jobTitle', 'resume'],
                    additionalProperties: false
                }
            }
        },
        system: `You tailor resumes to job descriptions for a real candidate. You are given the candidate's full "master" resume (every job, bullet, and skill they have), optionally some additional experience notes not yet folded into the master resume, and a job description. Select and lightly reword only the bullets, skills, and summary language relevant to this job — do not invent experience, employers, dates, or skills that aren't in the master resume or notes. Keep it truthful and roughly one page. Preserve section order: Summary, Experience, Education, Projects, Technical Skills.\n\n${FORMAT_CONTRACT}`,
        messages: [
            {
                role: 'user',
                content: `MASTER RESUME:\n\n${baseResumeMd}${formatKnowledgeBlock(knowledgeEntries)}\n\n---\n\nJOB DESCRIPTION:\n\n${jobDescription}`
            }
        ]
    });

    const text = response.content.find((b) => b.type === 'text')?.text;
    const parsed = JSON.parse(text);
    return parsed;
}

/**
 * Turn a raw, informal note about a work accomplishment into a tagged knowledge snippet.
 * @param {string} rawText
 * @returns {Promise<{summary: string, tags: string[], company: string, dateContext: string}>}
 */
export async function analyzeKnowledge(rawText) {
    const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        output_config: {
            effort: 'low',
            format: {
                type: 'json_schema',
                schema: {
                    type: 'object',
                    properties: {
                        summary: { type: 'string', description: 'One tight, resume-ready sentence describing the accomplishment, past tense, no first-person pronoun' },
                        tags: { type: 'array', items: { type: 'string' }, description: 'Short lowercase skill/technology/domain tags, e.g. "pytorch", "leadership", "data pipelines"' },
                        company: { type: 'string', description: 'Company or project this relates to, if mentioned or clearly inferable; empty string if unknown' },
                        dateContext: { type: 'string', description: 'Rough timeframe if mentioned, e.g. "2024" or "Q2 2023"; empty string if not mentioned' }
                    },
                    required: ['summary', 'tags', 'company', 'dateContext'],
                    additionalProperties: false
                }
            }
        },
        system: 'You turn a candidate\'s raw, informal note about something they did at work into a clean, resume-ready knowledge snippet. Extract a tight one-sentence summary (past tense, no "I"), relevant skill/technology/domain tags, and company/timeframe context if present. Do not embellish or invent details not in the note.',
        messages: [{ role: 'user', content: rawText }]
    });

    const text = response.content.find((b) => b.type === 'text')?.text;
    return JSON.parse(text);
}

/**
 * Apply a free-text correction to an existing resume markdown.
 * @param {string} currentResumeMd
 * @param {string} instruction - e.g. "shorten the summary to two sentences"
 * @returns {Promise<string>} the corrected markdown
 */
export async function applyCorrection(currentResumeMd, instruction) {
    const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        output_config: { effort: 'medium' },
        system: `You edit an existing resume markdown per the user's instruction. Return ONLY the full corrected resume markdown — no commentary, no code fences, no explanation. Preserve the exact structure of the input except for what the instruction asks you to change.\n\n${FORMAT_CONTRACT}`,
        messages: [
            {
                role: 'user',
                content: `CURRENT RESUME:\n\n${currentResumeMd}\n\n---\n\nCORRECTION: ${instruction}`
            }
        ]
    });

    const text = response.content.find((b) => b.type === 'text')?.text ?? '';
    return stripCodeFence(text);
}
