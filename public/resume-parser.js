// Resume Parser Module
// Common parsing logic for resume.md used by both PDF generator and website

/**
 * Main function to parse resume markdown into structured data
 * @param {string} markdown - The raw markdown text from resume.md
 * @returns {Object} Structured resume data
 */
export function parseResume(markdown) {
    const resume = {
        name: '',
        title: '',
        email: '',
        location: '',
        linkedin: '',
        github: '',
        portfolio: '',
        summary: '',
        sections: [] // Generic sections array: Experience, Education, Projects, Technical Skills
    };

    // Extract header information
    resume.name = extractName(markdown);
    resume.title = extractTitle(markdown);
    resume.email = extractEmail(markdown);
    resume.location = extractLocation(markdown);
    resume.linkedin = extractLinkedIn(markdown);
    resume.github = extractGitHub(markdown);
    resume.portfolio = extractPortfolio(markdown);

    // Extract summary
    resume.summary = extractSummary(markdown);

    // Extract all sections generically
    resume.sections = extractSections(markdown);

    return resume;
}

/**
 * Extract name from first # heading
 */
function extractName(markdown) {
    const nameMatch = markdown.match(/^# (.+)$/m);
    return nameMatch ? nameMatch[1].trim() : '';
}

/**
 * Extract title (bold text after name)
 */
function extractTitle(markdown) {
    const titleMatch = markdown.match(/\*\*(.+?)\*\*/);
    return titleMatch ? titleMatch[1].trim() : '';
}

/**
 * Extract email from contact section
 */
function extractEmail(markdown) {
    const emailMatch = markdown.match(/📧.*?\[([^\]]+)\]/);
    return emailMatch ? emailMatch[1] : '';
}

/**
 * Extract location
 */
function extractLocation(markdown) {
    const locationMatch = markdown.match(/📍 Location: (.+)$/m);
    return locationMatch ? locationMatch[1].trim() : '';
}

/**
 * Extract LinkedIn URL
 */
function extractLinkedIn(markdown) {
    const linkedinMatch = markdown.match(/🔗.*?\[([^\]]+)\]/);
    return linkedinMatch ? linkedinMatch[1] : '';
}

/**
 * Extract GitHub URL
 */
function extractGitHub(markdown) {
    const githubMatch = markdown.match(/🐙.*?\[([^\]]+)\]/);
    return githubMatch ? githubMatch[1] : '';
}

/**
 * Extract Portfolio URL
 */
function extractPortfolio(markdown) {
    const portfolioMatch = markdown.match(/🌐.*?\[([^\]]+)\]/);
    return portfolioMatch ? portfolioMatch[1] : '';
}

/**
 * Extract summary section
 */
function extractSummary(markdown) {
    const summaryMatch = markdown.match(/## Summary\s*\n\n(.*?)(?=\n\n## |$)/s);
    return summaryMatch ? summaryMatch[1].trim() : '';
}

/**
 * Extract all sections (Experience, Education, Projects, Technical Skills)
 * Returns array of section objects with structured entries
 */
function extractSections(markdown) {
    const sections = [];
    const sectionRegex = /## (Experience|Education|Projects|Technical Skills)\s*\n\n(.*?)(?=\n## |$)/gs;
    let sectionMatch;
    
    while ((sectionMatch = sectionRegex.exec(markdown)) !== null) {
        const sectionName = sectionMatch[1];
        const sectionContent = sectionMatch[2].trim();
        
        const entries = parseSection(sectionContent, sectionName);
        
        sections.push({
            name: sectionName,
            entries: entries
        });
    }
    
    return sections;
}

/**
 * Parse a section into entries based on its format
 * @param {string} content - Section content
 * @param {string} sectionName - Name of the section
 * @returns {Array} Array of entry objects
 */
function parseSection(content, sectionName) {
    const entries = [];
    const entryBlocks = content.split(/\n(?=\*\*)/);
    
    entryBlocks.forEach(block => {
        // Check if this is a single-line format (like Technical Skills)
        const singleLineMatch = block.match(/\*\*([^:]+):\*\*\s*(.+)/);
        
        if (singleLineMatch) {
            // Single line format: **Category:** items
            entries.push({
                title: singleLineMatch[1].trim(),
                subtitle: singleLineMatch[2].trim(),
                bullets: [],
                inline: true // Flag to render inline
            });
        } else {
            // Multi-line format with bullets (Experience, Education, Projects)
            const entry = parseMultiLineEntry(block);
            if (entry) {
                entries.push(entry);
            }
        }
    });
    
    return entries;
}

/**
 * Parse a multi-line entry (Experience, Education, Projects)
 * Generic parser that extracts: **title**, subtitle - *sub subtitle*
 * Also handles: **title**, *sub subtitle* (no subtitle, no dash)
 * 
 * Examples:
 *   **Cricut, Machine Learning Engineer**, South Jordan, Utah - *August 2023 - Present*
 *   **AI Text Adventure iOS Game**, *(Prototype, 2024)*
 */
function parseMultiLineEntry(block) {
    const lines = block.split('\n');
    const firstLine = lines[0];
    
    // Generic match: **title**, subtitle - *sub subtitle*
    // This captures everything in bold as title, everything between ** and the last - before *, 
    // and everything in * as sub subtitle
    const match = firstLine.match(/^\*\*(.+?)\*\*,?\s*(.*?)\s*[-—]\s*\*(.+?)\*\s*$/);
    
    if (match) {
        const [_, title, subtitle, subSubtitle] = match;
        
        // Extract bullets
        const bullets = [];
        const bulletMatches = block.matchAll(/^- (.+)$/gm);
        for (const match of bulletMatches) {
            // Remove bold markdown from bullets
            bullets.push(match[1].replace(/\*\*/g, ''));
        }
        
        return {
            title: title.trim(),
            subtitle: subtitle.trim(),
            subSubtitle: subSubtitle.trim(),
            bullets: bullets,
            inline: false
        };
    }
    
    // Try to match: **title**, *sub subtitle* (no subtitle, no dash)
    const matchNoDash = firstLine.match(/^\*\*(.+?)\*\*,\s*\*(.+?)\*\s*$/);
    
    if (matchNoDash) {
        const [_, title, subSubtitle] = matchNoDash;
        
        // Extract bullets
        const bullets = [];
        const bulletMatches = block.matchAll(/^- (.+)$/gm);
        for (const match of bulletMatches) {
            // Remove bold markdown from bullets
            bullets.push(match[1].replace(/\*\*/g, ''));
        }
        
        return {
            title: title.trim(),
            subtitle: '',
            subSubtitle: subSubtitle.trim(),
            bullets: bullets,
            inline: false
        };
    }
    
    return null;
}
