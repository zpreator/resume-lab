// PDF renderer — adapted from zpreator.github.io/resume-pdf.js, with the
// line-height overlap fix applied, extracted into a callable function that
// takes an already-parsed resume object (see resume-parser.js) instead of
// fetching resume.md and wiring up a button itself.
const LINE_HEIGHT_FACTOR = 1.15; // matches jsPDF's default line height for multi-line text

export function renderResumePDF(formattedResume) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'letter'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 30;
    const contentWidth = pageWidth - (margin * 2);
    let yPosition = margin;

    function addText(text, fontSize, fontStyle = 'normal', color = [0, 0, 0]) {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', fontStyle);
        doc.setTextColor(color[0], color[1], color[2]);

        const lines = doc.splitTextToSize(text, contentWidth);

        if (yPosition + (lines.length * fontSize * LINE_HEIGHT_FACTOR) > pageHeight - margin) {
            doc.addPage();
            yPosition = margin;
        }

        doc.text(lines, margin, yPosition);
        yPosition += lines.length * fontSize * LINE_HEIGHT_FACTOR + 5;
    }

    function addLine() {
        if (yPosition > pageHeight - margin - 10) {
            doc.addPage();
            yPosition = margin;
        }
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 10;
    }

    addText(formattedResume.name, 24, 'bold', [31, 41, 55]);
    addText(formattedResume.title, 14, 'normal', [99, 102, 241]);
    yPosition += 5;

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    const contactInfo = [
        formattedResume.email,
        formattedResume.location,
        formattedResume.linkedin,
        formattedResume.github
    ].filter(Boolean).join(' • ');

    const contactLines = doc.splitTextToSize(contactInfo, contentWidth);
    doc.text(contactLines, margin, yPosition);
    yPosition += contactLines.length * 12 + 15;

    addLine();

    if (formattedResume.summary) {
        addText(formattedResume.summary, 10, 'normal', [60, 60, 60]);
        yPosition += 10;
    }

    formattedResume.sections.forEach(section => {
        addLine();
        addText(section.name.toUpperCase(), 12, 'bold', [99, 102, 241]);

        section.entries.forEach(entry => {
            if (yPosition > pageHeight - margin - 100) {
                doc.addPage();
                yPosition = margin;
            }

            if (entry.inline) {
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(60, 60, 60);
                const inlineText = `${entry.title}: `;
                doc.text(inlineText, margin, yPosition);

                const titleWidth = doc.getTextWidth(inlineText);
                doc.setFont('helvetica', 'normal');
                const subtitleLines = doc.splitTextToSize(entry.subtitle, contentWidth - titleWidth - 10);
                doc.text(subtitleLines, margin + titleWidth, yPosition);
                yPosition += subtitleLines.length * 12 + 5;
            } else {
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(31, 41, 55);

                doc.text(entry.title, margin, yPosition);
                const titleWidth = doc.getTextWidth(entry.title);

                if (entry.subtitle) {
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(60, 60, 60);
                    doc.text(', ' + entry.subtitle, margin + titleWidth, yPosition);
                }

                if (entry.subSubtitle) {
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(100, 100, 100);
                    const subSubtitleWidth = doc.getTextWidth(entry.subSubtitle);
                    doc.text(entry.subSubtitle, pageWidth - margin - subSubtitleWidth, yPosition);
                }

                yPosition += 15;

                entry.bullets.forEach(bullet => {
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(60, 60, 60);
                    const bulletLines = doc.splitTextToSize('• ' + bullet, contentWidth - 10);

                    if (yPosition + (bulletLines.length * 12) > pageHeight - margin) {
                        doc.addPage();
                        yPosition = margin;
                    }

                    doc.text(bulletLines, margin + 5, yPosition);
                    yPosition += bulletLines.length * 12;
                });

                yPosition += 10;
            }
        });
    });

    return doc;
}
