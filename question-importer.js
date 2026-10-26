/**
 * question-importer.js
 * Universal Question Import & Parsing Engine for MashQ
 * 
 * Architecture:
 * 1. Extraction: DOCX (via Mammoth HTML), PDF (via PDF.js layout coordinates), Clipboard HTML/Plain, TXT, MD
 * 2. Normalization: Unicode, linebreaks, spaces, dashes, quotes while preserving math/formulas
 * 3. Segmentation: Multi-signal boundary detection (numbers, option signatures, answer markers, spacing)
 * 4. Classification & Extraction:
 *    - Standard MCQs
 *    - Statement-based MCQs (Roman I-IV, Arabic 1-4)
 *    - Match-the-following (Paragraph-form & Table-form List I/II)
 *    - Assertion-Reason (A & R)
 *    - Fill-in-the-blank (with or without choices)
 *    - True/False
 *    - Passage-based & Numerical MCQs
 * 5. Answer & Explanation Extraction: Inline answers, end-of-document answer keys, topics, solutions
 * 6. Validation & Confidence: Ready, Review Suggested, Incomplete, Duplicate detection
 * 7. Test-taking Display Formatting: Formats question text cleanly so renderFormattedQuestion renders seamlessly
 */
// ============================================================
// STAGE 1: DOCUMENT & CLIPBOARD TEXT EXTRACTION
// ============================================================
/**
 * Extract structured text from Word (.docx) using Mammoth HTML conversion.
 * Preserves paragraphs, headings, lists, and tables (List I / List II columns).
 */
export async function extractTextFromDocx(arrayBuffer) {
  if (typeof mammoth === "undefined") {
    throw new Error("Mammoth library is not loaded. Please check your internet connection.");
  }
  try {
    // 1. Try HTML conversion to preserve rich structure (tables, lists, paragraphs)
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value || "";
    
    if (html.trim()) {
      return convertHtmlToStructuredText(html);
    }
    // 2. Fallback to raw text if HTML is empty
    const rawResult = await mammoth.extractRawText({ arrayBuffer });
    return rawResult.value || "";
  } catch (err) {
    throw new Error(`Failed to read Word document: ${err.message || err}`);
  }
}
/**
 * Reconstruct text from PDF.js items using 2D coordinates (tx, ty),
 * line clustering, column detection, hyphenation repair, and header/footer filtering.
 */
export async function extractTextFromPdf(arrayBuffer) {
  if (typeof pdfjsLib === "undefined") {
    throw new Error("PDF.js library is not loaded. Please check your internet connection.");
  }
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  } catch (err) {
    if (err.name === "PasswordException") {
      throw new Error("The PDF is password protected. Please remove the password and try again.");
    }
    throw new Error(`Could not open PDF file: ${err.message || err}`);
  }
  const numPages = pdf.numPages;
  if (numPages === 0) {
    throw new Error("The PDF document contains 0 pages.");
  }
  const pageTexts = [];
  let totalCharacters = 0;
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const items = textContent.items || [];
    if (items.length === 0) {
      pageTexts.push("");
      continue;
    }
    // Clean & extract coordinate data
    const parsedItems = items
      .filter(item => item.str && item.str.trim().length > 0)
      .map(item => {
        const tx = item.transform[4];
        const ty = item.transform[5];
        return {
          str: item.str,
          x: Math.round(tx * 10) / 10,
          y: Math.round(ty * 10) / 10,
          width: item.width || 0,
          height: item.height || 10
        };
      });
    const pageCharCount = parsedItems.reduce((acc, it) => acc + it.str.length, 0);
    totalCharacters += pageCharCount;
    // Detect 2-column layout on this page
    const pageWidth = viewport.width || 612; // default letter width
    const midPoint = pageWidth / 2;
    const col1Items = [];
    const col2Items = [];
    
    // Check if items distinctly separate into left and right columns with a middle gutter
    let isTwoColumn = false;
    if (parsedItems.length > 30) {
      let leftCount = 0;
      let rightCount = 0;
      let gutterCount = 0;
      const gutterStart = midPoint - 20;
      const gutterEnd = midPoint + 20;
      for (const it of parsedItems) {
        if (it.x + it.width < gutterStart) leftCount++;
        else if (it.x > gutterEnd) rightCount++;
        else gutterCount++;
      }
      // If at least 35% on left and 35% on right, and gutter is clear (< 8% items)
      if (leftCount / parsedItems.length > 0.35 && rightCount / parsedItems.length > 0.35 && gutterCount / parsedItems.length < 0.08) {
        isTwoColumn = true;
      }
    }
    let pageText = "";
    if (isTwoColumn) {
      for (const it of parsedItems) {
        if (it.x < midPoint) col1Items.push(it);
        else col2Items.push(it);
      }
      const textCol1 = clusterItemsIntoLines(col1Items);
      const textCol2 = clusterItemsIntoLines(col2Items);
      pageText = textCol1 + "\n\n" + textCol2;
    } else {
      pageText = clusterItemsIntoLines(parsedItems);
    }
    pageTexts.push(pageText);
  }
  // Scanned PDF detection: if multi-page document yields < 40 chars total or average < 15 chars/page
  const avgCharsPerPage = totalCharacters / numPages;
  if (totalCharacters < 40 || (numPages > 1 && avgCharsPerPage < 15)) {
    const error = new Error(
      "This PDF appears to be a scanned image or contains no selectable text. " +
      "MashQ requires digital text-based PDFs or Word documents. " +
      "Please copy and paste the text directly into the box, or convert the PDF with an OCR tool before importing."
    );
    error.isScannedPdf = true;
    error.totalCharacters = totalCharacters;
    error.numPages = numPages;
    throw error;
  }
  // Filter out repeated running headers / footers (e.g., page numbers, document titles)
  const cleanedPageTexts = filterRunningHeadersFooters(pageTexts);
  // Join pages with double newline and repair wrapping hyphens
  let fullText = cleanedPageTexts.join("\n\n");
  fullText = repairHyphenation(fullText);
  return fullText;
}
/**
 * Group PDF text items into vertical lines based on Y-coordinate proximity,
 * sort left-to-right, and insert appropriate spaces.
 */
function clusterItemsIntoLines(items) {
  if (!items || items.length === 0) return "";
  // Sort items primarily by Y descending (top-to-bottom in PDF coordinates), then X ascending
  // Note: in PDF, (0,0) is bottom-left, so higher Y is higher on the physical page
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 3.5) return yDiff; // items on different lines
    return a.x - b.x; // items on same line
  });
  const lines = [];
  let currentLine = [];
  let currentY = null;
  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) <= 3.5) {
      currentLine.push(item);
      currentY = currentY === null ? item.y : (currentY + item.y) / 2; // running average Y
    } else {
      // Line finished
      lines.push(assembleLine(currentLine));
      currentLine = [item];
      currentY = item.y;
    }
  }
  if (currentLine.length > 0) {
    lines.push(assembleLine(currentLine));
  }
  return lines.join("\n");
}
function assembleLine(lineItems) {
  lineItems.sort((a, b) => a.x - b.x);
  let lineStr = "";
  let lastEnd = null;
  for (const it of lineItems) {
    if (lastEnd !== null) {
      const gap = it.x - lastEnd;
      // If gap is greater than ~2.5 points and neither string starts/ends with space
      if (gap > 2.5 && !lineStr.endsWith(" ") && !it.str.startsWith(" ")) {
        lineStr += " ";
      }
    }
    lineStr += it.str;
    lastEnd = it.x + it.width;
  }
  return lineStr.trim();
}
/**
 * Filter out identical running headers/footers appearing across multiple pages.
 */
function filterRunningHeadersFooters(pageTexts) {
  if (pageTexts.length < 2) return pageTexts;
  const firstLines = [];
  const lastLines = [];
  pageTexts.forEach(p => {
    const lines = p.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length > 0) firstLines.push(lines[0]);
    if (lines.length > 1) lastLines.push(lines[lines.length - 1]);
  });
  // Check for common header/footer repeated on >= 60% of pages
  function findRepetitivePattern(linesArr) {
    const counts = {};
    linesArr.forEach(l => {
      // Ignore single numbers (ordinary page numbers like "1", "2") or check patterns
      const normalized = l.replace(/\d+/g, "#").trim();
      counts[normalized] = (counts[normalized] || 0) + 1;
    });
    const threshold = Math.max(2, Math.floor(pageTexts.length * 0.6));
    const repetitive = new Set();
    Object.entries(counts).forEach(([pattern, count]) => {
      if (count >= threshold) repetitive.add(pattern);
    });
    return repetitive;
  }
  const repetitiveHeaders = findRepetitivePattern(firstLines);
  const repetitiveFooters = findRepetitivePattern(lastLines);
  return pageTexts.map(p => {
    const lines = p.split("\n");
    if (lines.length === 0) return p;
    let startIdx = 0;
    let endIdx = lines.length;
    // Check top line
    if (lines[0]) {
      const topNorm = lines[0].trim().replace(/\d+/g, "#");
      if (repetitiveHeaders.has(topNorm) || /^(?:page\s*\d+\s*(?:of\s*\d+)?|\d+)$/i.test(lines[0].trim())) {
        startIdx = 1;
      }
    }
    // Check bottom line
    if (lines.length > 1) {
      const btmNorm = lines[lines.length - 1].trim().replace(/\d+/g, "#");
      if (repetitiveFooters.has(btmNorm) || /^(?:page\s*\d+\s*(?:of\s*\d+)?|\d+)$/i.test(lines[lines.length - 1].trim())) {
        endIdx = lines.length - 1;
      }
    }
    return lines.slice(startIdx, endIdx).join("\n");
  });
}
/**
 * Repair words hyphenated across line breaks, e.g. "com-\nmodity" -> "commodity",
 * without corrupting mathematical negative signs or ranges.
 */
function repairHyphenation(text) {
  // Matches a lowercase/uppercase word ending with hyphen at line end, followed by lowercase word on next line
  return text.replace(/([a-zA-Z]{2,})-\n\s*([a-z]{2,})/g, "$1$2");
}
/**
 * Convert HTML from Mammoth or Clipboard into structured plain text,
 * translating tables, table rows, lists, headings, and paragraphs cleanly.
 */
export function convertHtmlToStructuredText(html) {
  if (!html) return "";
  // Parse using browser's DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  // Remove dangerous tags and noise
  const unwanted = doc.querySelectorAll("script, style, meta, link, noscript, svg");
  unwanted.forEach(el => el.remove());
  // Process tables: convert <table> to structured text (especially 2-column matching tables)
  const tables = doc.querySelectorAll("table");
  tables.forEach(table => {
    const rows = table.querySelectorAll("tr");
    let tableText = "\n";
    let isTwoColumn = true;
    // Check row structure
    const rowData = [];
    rows.forEach(tr => {
      const cells = tr.querySelectorAll("th, td");
      const cellTexts = Array.from(cells).map(c => c.textContent.trim()).filter(Boolean);
      if (cellTexts.length > 0) {
        rowData.push(cellTexts);
        if (cellTexts.length !== 2) isTwoColumn = false;
      }
    });
    if (isTwoColumn && rowData.length >= 2) {
      // Format as List I & List II columns
      const firstRow = rowData[0];
      const isHeaderRow = /list|column|group|heading/i.test(firstRow[0] + " " + firstRow[1]);
      
      const col1Title = isHeaderRow ? firstRow[0] : "List I";
      const col2Title = isHeaderRow ? firstRow[1] : "List II";
      
      tableText += `${col1Title}\n`;
      const dataRows = isHeaderRow ? rowData.slice(1) : rowData;
      
      // Column 1 items
      dataRows.forEach(r => {
        tableText += `${r[0]}\n`;
      });
      tableText += `\n${col2Title}\n`;
      // Column 2 items
      dataRows.forEach(r => {
        tableText += `${r[1]}\n`;
      });
      tableText += "\n";
    } else {
      // General table formatting
      rowData.forEach(cells => {
        tableText += cells.join("   |   ") + "\n";
      });
      tableText += "\n";
    }
    const textNode = doc.createTextNode(tableText);
    table.parentNode.replaceChild(textNode, table);
  });
  // Process ordered lists (<ol>): ensure each <li> retains its numbering and double-newlines
  const olElements = doc.querySelectorAll("ol");
  olElements.forEach(ol => {
    const listItems = ol.querySelectorAll(":scope > li");
    listItems.forEach((li, idx) => {
      const text = li.textContent.trim();
      // If it doesn't already have an explicit question number (e.g. 1., Q1., (1)), prepend it
      if (!/^(?:q(?:ue(?:stion)?)?\.?\s*(?:no\.?)?\s*\d+|(?:\(\d+\))|\d+[\.\)\:\-])(?:\s+|$)/i.test(text)) {
        li.prepend(doc.createTextNode(`${idx + 1}. `));
      }
      li.insertAdjacentText("afterend", "\n\n");
    });
  });
  // Process unordered lists (<ul>): ensure each <li> has double newline
  const ulElements = doc.querySelectorAll("ul");
  ulElements.forEach(ul => {
    const listItems = ul.querySelectorAll(":scope > li");
    listItems.forEach(li => {
      li.insertAdjacentText("afterend", "\n\n");
    });
  });
  // Process block elements: ensure double newline
  const blocks = doc.querySelectorAll("p, div, h1, h2, h3, h4, h5, h6, tr");
  blocks.forEach(b => {
    b.insertAdjacentText("afterend", "\n\n");
  });
  const rawExtracted = doc.body.textContent || "";
  return rawExtracted.replace(/\n{3,}/g, "\n\n").trim();
}
/**
 * Handle paste event by inspecting text/html first for table/list preservation,
 * falling back gracefully to text/plain.
 */
export function extractFromClipboard(clipboardData) {
  if (!clipboardData) return "";
  const htmlData = clipboardData.getData("text/html");
  if (htmlData && htmlData.includes("<table") || htmlData.includes("<li") || htmlData.includes("<h")) {
    try {
      const structured = convertHtmlToStructuredText(htmlData);
      if (structured && structured.length > 20) {
        return structured;
      }
    } catch (e) {
      console.warn("HTML clipboard parse failed, falling back to text/plain:", e);
    }
  }
  return clipboardData.getData("text/plain") || "";
}
// ============================================================
// STAGE 2: NORMALIZATION & TAG STRIPPING
// ============================================================
/**
 * Strip AI artifact tags such as [Reconstructed option], (Reconstructed option),
 * [Reconstructed], [Original option], [Correct], etc.
 */
export function cleanReconstructedTags(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/\s*\[\s*(?:reconstructed(?:\s+option)?|original(?:\s+option)?|missing(?:\s+option)?|suggested)\s*\]/gi, "")
    .replace(/\s*\(\s*(?:reconstructed(?:\s+option)?|original(?:\s+option)?|missing(?:\s+option)?|suggested)\s*\)/gi, "")
    .replace(/\s*\[\s*(?:correct|correct\s+option|answer|key)\s*\]/gi, "")
    .replace(/\s*\(\s*(?:correct|correct\s+option|answer|key)\s*\)/gi, "")
    .trim();
}
export function cleanOptionText(text) {
  return cleanReconstructedTags(text);
}
/**
 * Normalize input text while strictly preserving equations, fractions,
 * minus signs, decimals, units, and punctuation.
 */
export function normalizeText(rawInput) {
  if (!rawInput || typeof rawInput !== "string") return "";
  let s = rawInput;
  // 1. Remove UTF-8 BOM if present
  if (s.charCodeAt(0) === 0xFEFF) {
    s = s.slice(1);
  }
  // 2. Normalize line endings (CRLF and CR -> LF)
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // 3. Normalize Unicode spaces
  // \u00A0 (non-breaking), \u2000-\u200B (en-quad, em-quad, thin, zero-width)
  s = s.replace(/[\u00A0\u2000-\u200A\u202F\u205F]/g, " ");
  s = s.replace(/[\u200B\uFEFF]/g, ""); // strip zero-width characters
  // 4. Normalize curly quotes and backticks to standard quotes
  s = s.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"');
  s = s.replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  // 5. Normalize dashes:
  // Convert en-dash/em-dash used as punctuation or list separators to standard '-'
  // e.g. "Answer – C" -> "Answer - C", but preserve negative numbers like "-5°C"
  s = s.replace(/[\u2013\u2014\u2015]/g, "-");
  // 6. Normalize common bullet markers at beginning of lines
  s = s.replace(/^[\t ]*[•▪●‣\*\+]\s+/gm, "");
  // 7. Strip markdown bold / italic wrappers around question numbers and option labels
  // e.g. "**Q1.**" -> "Q1.", "**A.**" -> "A.", "**Answer:**" -> "Answer:"
  s = s.replace(/\*\*([A-Za-z0-9\.\(\)\:\s]{1,15})\*\*/g, "$1");
  s = s.replace(/###\s+/g, "");
  // 8. Trim trailing spaces on each line and collapse 3+ blank lines into 2
  s = s.replace(/[ \t]+$/gm, "");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
// ============================================================
// STAGE 3: SEPARATE END-OF-DOCUMENT ANSWER KEYS
// ============================================================
/**
 * Detect and extract separate answer keys placed at the bottom or end of document.
 * Examples:
 *   "Answer Key: 1-B, 2-C, 3-A, 4-D"
 *   "Answers: 1. (B) 2. (C) 3. (A)"
 *   "KEY: 1. B; 2. C; 3. A"
 */
export function separateAnswerKey(text) {
  // Regex looking for answer key header near the bottom of text
  const keyHeaderRegex = /\n+(?:---+\s*\n+)?(?:\*{0,2})(?:ANSWER\s*KEY|ANSWERS|ANSWER\s*SHEET|SOLUTIONS?\s*KEY|KEY)(?:\*{0,2})\s*[\:\-\=]?\s*([^\n]*(?:\n[^\n]+)*)$/i;
  const match = text.match(keyHeaderRegex);
  if (!match) {
    return { mainText: text, answerKeyMap: new Map() };
  }
  const keyBlock = match[1] || "";
  const mainText = text.slice(0, match.index).trim();
  const answerKeyMap = new Map();
  // Pattern A: "1-B, 2-C", "1:B, 2:C", "1. B, 2. C", "1) B 2) C", "Q1-B", "1 - (B)"
  const entryRegex = /(?:(?:Q(?:ue(?:stion)?)?\.?\s*)?(\d{1,4})[\.\:\)\-\s]+\(?([A-Da-d1-4])\)?)/g;
  let m;
  while ((m = entryRegex.exec(keyBlock)) !== null) {
    const qNum = parseInt(m[1], 10);
    const letter = m[2].toUpperCase();
    let optIdx = -1;
    if (letter >= "A" && letter <= "F") {
      optIdx = letter.charCodeAt(0) - 65;
    } else if (letter >= "1" && letter <= "6") {
      optIdx = parseInt(letter, 10) - 1;
    }
    if (optIdx !== -1) {
      answerKeyMap.set(qNum, optIdx);
    }
  }
  return { mainText, answerKeyMap };
}
// ============================================================
// STAGE 4: QUESTION BOUNDARY DETECTION & SEGMENTATION
// ============================================================
/**
 * Question segmenter using multiple structural signals:
 * - Explicit question number patterns (1., Q1., Q. 1, Question 1:)
 * - Option block patterns
 * - Guard conditions against splitting on decimals, dates, or statements
 */
export function segmentQuestions(text) {
  if (!text || !text.trim()) return [];
  // Question number header pattern at start of line
  // Matches: "1.", "1)", "(1)", "Q1.", "Q. 1)", "Question 1:", "Que 1.", "Que. 1:"
  const qNumPattern = /^(?:Q(?:ue(?:stion)?)?\.?\s*(?:no\.?)?\s*(\d{1,4})[\.\)\:\-]|(?:\((\d{1,4})\))|(\d{1,4})[\.\)\:\-])(?:\s+|$)/im;
  const lines = text.split("\n");
  const rawSegments = [];
  let currentLines = [];
  let currentQNum = null;
  // Option regex to identify options within questions
  const optionStartRegex = /^(?:[A-Da-d][\.\)\:\-]|(?:\([A-Da-d]\)))\s+/;
  // Answer marker regex
  const answerMarkerRegex = /^(?:correct\s*)?(?:answer|ans|key)[\.\:\=\-]?\s*/i;
  function pushCurrent() {
    if (currentLines.length > 0) {
      const segText = currentLines.join("\n").trim();
      if (segText) {
        rawSegments.push({
          sourceNumber: currentQNum,
          rawText: segText
        });
      }
      currentLines = [];
      currentQNum = null;
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentLines.length > 0) {
        currentLines.push("");
      }
      continue;
    }
    const numMatch = trimmed.match(qNumPattern);
    if (numMatch) {
      const detectedNum = parseInt(numMatch[1] || numMatch[2] || numMatch[3], 10);
      
      // Guard Check: Is this REALLY a new question or part of a statement/calculation/matching list?
      const isGuard = isNumberInsideQuestionContent(trimmed, numMatch[0], currentLines);
      if (!isGuard) {
        // Legitimate new question boundary!
        pushCurrent();
        currentQNum = detectedNum;
        currentLines.push(line);
        continue;
      }
    }
    // Check for unnumbered questions separated by blank lines and starting with a fresh interrogative
    if (currentLines.length > 0 && isUnnumberedQuestionBoundary(line, currentLines)) {
      pushCurrent();
      currentLines.push(line);
      continue;
    }
    currentLines.push(line);
  }
  pushCurrent();
  return rawSegments;
}
/**
 * Guard check: determines whether a number at line start is actually part of
 * a statement list (e.g. "1. Statement one", "2. Statement two"), a decimal value,
 * or a matching list item inside the existing question.
 */
function isNumberInsideQuestionContent(line, matchPrefix, currentLines) {
  if (currentLines.length === 0) return false;
  const currentBlock = currentLines.join("\n");
  
  // If the current question already has an answer marker,
  // any new number (e.g. "4. Next question") is DEFINITELY a new question!
  const hasAnswerAlready = /\b(?:answer|ans|key)\s*[\:\-\=]/i.test(currentBlock);
  if (hasAnswerAlready) {
    return false;
  }

  // Case 1: Inside Match List or Statements:
  // e.g. "Match List I with List II", "Consider the following statements"
  if (/\b(?:match|list|column|pairs?|statements?|consider|following)\b/i.test(currentBlock)) {
    const numVal = parseInt(matchPrefix.replace(/\D/g, ""), 10);
    if (numVal >= 1 && numVal <= 15) {
      const hasUppercaseOptions = (currentBlock.match(/(?:^|\n)\s*(?:\([A-D]\)|[A-D][\.\)\:])\s+/g) || []).length >= 2;
      if (!hasUppercaseOptions) {
        return true; // Inside statements/matching list
      }
    }
  }

  const hasOptionsAlready = (currentBlock.match(/(?:^|\n)\s*(?:\([A-D]\)|[A-D][\.\)\:])\s+/g) || []).length >= 2;
  if (hasOptionsAlready) {
    return false;
  }
  // Case 2: The current question text is short (< 3 lines) and hasn't defined any options yet,
  // and the line contains words indicating statements:
  const numVal = parseInt(matchPrefix.replace(/\D/g, ""), 10);
  if (numVal > 1 && numVal <= 8 && (currentBlock.includes("1.") || currentBlock.includes("1)"))) {
    return true;
  }
  return false;
}
/**
 * Check if a line marks an unnumbered new question (e.g. repeated question blocks without explicit Q#)
 */
function isUnnumberedQuestionBoundary(line, currentLines) {
  const currentBlock = currentLines.join("\n");
  const hasOptions = (currentBlock.match(/(?:^|\n)\s*(?:\([A-Da-d]\)|[A-Da-d][\.\)\:\-])\s+/g) || []).length >= 2;
  const hasAnswer = /\b(?:answer|ans|key)\s*[\:\-\=]/i.test(currentBlock);
  // Guard: conclusion phrases like "Choose the correct code", "Select the correct combination",
  // "Which of the statements given above" belong to the CURRENT question!
  if (/^(?:choose\s+the\s+correct|select\s+the\s+correct|which\s+(?:of\s+the\s+statements|of\s+these\s+statements|statement|of\s+the\s+pairs))\b/i.test(line.trim())) {
    return false;
  }
  // Guard: if current block is a matching question and hasn't concluded with an answer yet, don't split!
  if (/\b(?:match\s+list|match\s+column|match\s+the\s+following|match\s+the\s+pairs)\b/i.test(currentBlock) && !hasAnswer) {
    return false;
  }
  const isQuestionPhrase = /^(?:which|what|who|where|when|why|how|consider|match|in\s+(?:the\s+context|which|case|relation|respect|accordance)|identify|choose|select|state|assertion|examine|given|read|with\s+reference\s+to|directions|find|calculate|determine)\b/i.test(line.trim());
  const isOptionLine = /^(?:[A-Da-d][\.\)\:\-]|(?:\([A-Da-d]\)))\s+/i.test(line.trim());
  if ((hasAnswer || hasOptions) && isQuestionPhrase && !isOptionLine) {
    return true;
  }
  return false;
}
// ============================================================
// STAGE 5: QUESTION TYPE CLASSIFICATION & FIELD EXTRACTION
// ============================================================
/**
 * Master classifier and field extractor for a single raw question segment.
 */
export function classifyAndExtractQuestion(segment, answerKeyMap = new Map()) {
  const rawText = segment.rawText || "";
  const sourceNumber = segment.sourceNumber;
  // 1. Separate Explanation & Topic if present at the bottom
  const { cleanedText, explanation, topic } = extractMetadata(rawText);
  // 2. Extract Options & Answer
  const { stemText, options, inlineAnswer, answerText, inlineExplanation } = extractStemAndOptions(cleanedText);
  const finalExplanation = explanation || inlineExplanation || "";
  // 3. Resolve Correct Answer Index
  let correctIndex = null;
  let answerSource = "none";
  if (inlineAnswer !== null && inlineAnswer >= 0 && inlineAnswer < options.length) {
    correctIndex = inlineAnswer;
    answerSource = "inline";
  } else if (sourceNumber && answerKeyMap.has(sourceNumber)) {
    correctIndex = answerKeyMap.get(sourceNumber);
    answerSource = "key";
  } else if (answerText && options.length > 0) {
    // Try matching answer text to one of the options
    const normAns = answerText.toLowerCase().trim();
    for (let i = 0; i < options.length; i++) {
      const optClean = options[i].toLowerCase().trim();
      if (optClean === normAns || optClean.startsWith(normAns) || normAns.startsWith(optClean)) {
        correctIndex = i;
        answerSource = "text_match";
        break;
      }
    }
  }
  // 4. Classify Question Type
  const classification = classifyQuestionType(stemText, options);
  // 5. Structure fields based on classified type
  const structuredData = buildStructuredFields(classification.type, stemText, options);
  // 6. Generate formatted text for live test rendering compatibility
  const formattedText = formatQuestionTextForRendering(classification.type, stemText, structuredData);
  return {
    rawSource: rawText,
    sourceNumber,
    questionType: classification.type,
    typeConfidence: classification.confidence,
    text: formattedText,
    rawStem: stemText,
    options: options.map(o => o.trim()),
    correctIndex,
    answerSource,
    topic: topic || "",
    explanation: finalExplanation,
    structured: structuredData,
    warnings: []
  };
}
/**
 * Extract Topic, Category, and Explanation markers attached to the question block.
 */
function extractMetadata(text) {
  let cleanedText = text;
  let explanation = "";
  let topic = "";
  // 1. Extract Explanation / Solution (separated by newline OR whitespace)
  const expMatch = cleanedText.match(/(?:(?:\n+|\s+)(?:\*{0,2})(?:Explanation|Solution|Rationale|Note)(?:\*{0,2})\s*[\:\-\=]\s*([\s\S]+))$/i);
  if (expMatch) {
    explanation = expMatch[1].trim();
    cleanedText = cleanedText.slice(0, expMatch.index).trim();
  }
  // 2. Extract Topic / Subject
  const topicMatch = cleanedText.match(/(?:(?:\n+|\s+)(?:\*{0,2})(?:Topic|Category|Subject|Subtopic)(?:\*{0,2})\s*[\:\-\=]\s*([^Answer\n]+?))(?=(?:\s+(?:Correct\s+)?(?:Answer|Ans|Key)|$))/i) ||
                     cleanedText.match(/(?:(?:\n+|\s+)(?:\*{0,2})(?:Topic|Category|Subject|Subtopic)(?:\*{0,2})\s*[\:\-\=]\s*([^\n]+))$/i);
  if (topicMatch) {
    topic = topicMatch[1].trim();
    cleanedText = (cleanedText.slice(0, topicMatch.index) + cleanedText.slice(topicMatch.index + topicMatch[0].length)).trim();
  }
  return { cleanedText, explanation, topic };
}
/**
 * Separate the question stem, answer choices (A-D / 1-4), and inline answer marker.
 * Supports both multi-line options and options clustered in a single paragraph!
 */
function extractStemAndOptions(text) {
  // Strip reconstructed option tags and noise first
  let stemText = cleanReconstructedTags(text);
  let options = [];
  let inlineAnswer = null;
  let answerText = "";
  let inlineExplanation = "";
  // 1. Check for inline answer at the end of the text (on a new line or trailing)
  const ansRegex = /(?:(?:\n+|\s+)(?:\*{0,2})(?:Correct\s+)?(?:Answer|Ans|Key|Correct\s+Option)(?:\*{0,2})\s*[\:\-\=\.]*\s*(?:\(?([A-Fa-f1-6])\)?[.:]?|(?:\(([A-Fa-f1-6])\))|([^\n]+)))\s*$/i;
  const ansMatch = stemText.match(ansRegex);
  if (ansMatch) {
    const letter = ansMatch[1] || ansMatch[2];
    if (letter) {
      const char = letter.toUpperCase();
      if (char >= "A" && char <= "F") {
        inlineAnswer = char.charCodeAt(0) - 65;
      } else if (char >= "1" && char <= "6") {
        inlineAnswer = parseInt(char, 10) - 1;
      }
    } else if (ansMatch[3]) {
      answerText = ansMatch[3].trim().replace(/^[.:]\s*/, "");
    }
    stemText = stemText.slice(0, ansMatch.index).trim();
  }
  // 2. Specialized Check: Match-the-following combination choices:
  // e.g. "(A) 1-C, 2-A, 3-B (B) 1-A, 2-B, 3-C" or "A) a-1, b-3, c-2, d-4 B) a-2, b-1..."
  const comboOptionRegex = /(?:^|\s)(?:\(([A-Da-d])\)|([A-Da-d])[\.\)\:])\s+((?:(?:\d+[\-–][A-Za-z]|[A-Za-z][\-–]\d+|[A-Za-z]\s+\d+|\d+\s+[A-Za-z])[^\(\n]*))(?=(?:\s+(?:\([A-Da-d]\)|[A-Da-d][\.\)\:]\s+))|$)/g;
  const comboMatches = [];
  let cm;
  while ((cm = comboOptionRegex.exec(stemText)) !== null) {
    comboMatches.push({
      index: cm.index,
      label: (cm[1] || cm[2]).toUpperCase(),
      text: cm[3].trim()
    });
  }
  if (comboMatches.length >= 2 && comboMatches[0].label === "A") {
    const firstOptIdx = comboMatches[0].index;
    const rawStem = stemText.slice(0, firstOptIdx).trim();
    options = comboMatches.map(m => cleanOptionText(m.text));
    stemText = cleanQuestionNumberPrefix(rawStem);
  }

  // 3. Specialized Check: Match-the-following questions with List II / Column II header
  // In matching questions, options occur strictly AFTER List II: and are labeled A), B), C), D)
  if (options.length === 0) {
    const list2Header = stemText.match(/(?:^|\n)\s*(?:List\s*[-–]?\s*(?:II|2|B)|Column\s*[-–]?\s*(?:II|2|B)|Group\s*[-–]?\s*(?:II|2|B))\b/i);
    if (list2Header) {
      const postL2 = stemText.slice(list2Header.index);
      const optRegexL2 = /(?:^|\n)\s*(?:\(([A-D])\)|([A-D])[\.\)\:\-])\s+/gi;
      const l2Matches = [];
      let lm;
      while ((lm = optRegexL2.exec(postL2)) !== null) {
        l2Matches.push({
          index: list2Header.index + lm.index,
          end: list2Header.index + optRegexL2.lastIndex,
          label: (lm[1] || lm[2]).toUpperCase()
        });
      }
      if (l2Matches.length >= 2 && l2Matches[0].label === "A") {
        const firstOptIdx = l2Matches[0].index;
        const rawStem = stemText.slice(0, firstOptIdx).trim();
        options = [];
        for (let i = 0; i < l2Matches.length; i++) {
          const start = l2Matches[i].end;
          const end = (i + 1 < l2Matches.length) ? l2Matches[i + 1].index : stemText.length;
          options.push(cleanOptionText(stemText.slice(start, end).trim()));
        }
        stemText = cleanQuestionNumberPrefix(rawStem);
      }
    }
  }
  // 4. Standard MCQ options
  if (options.length === 0) {
    // If text contains uppercase options A-F, restrict regex to uppercase [A-F]
    // so that lowercase statements/list items like a), b), c) in the stem are preserved!
    const hasUppercaseOptions = (stemText.match(/(?:^|\n|\s)(?:\(([A-F])\)|([A-F])[\.\)\:\-])\s+/g) || []).length >= 2;
    const optClass = hasUppercaseOptions ? "[A-F]" : "[A-Fa-f]";
    const optFlags = hasUppercaseOptions ? "" : "i";
    const lineOptionRegex = hasUppercaseOptions
      ? /(?:^|\n)\s*(?:[*\-\+]\s*)?(?:(?:\(([A-F])\)|([A-F])[\.\)\:\-])\s+)([\s\S]*?)(?=(?:\n\s*(?:[*\-\+]\s*)?(?:\([A-F]\)|[A-F][\.\)\:\-]\s+))|$)/g
      : /(?:^|\n)\s*(?:[*\-\+]\s*)?(?:(?:\(([A-Fa-f])\)|([A-Fa-f])[\.\)\:\-])\s+)([\s\S]*?)(?=(?:\n\s*(?:[*\-\+]\s*)?(?:\([A-Fa-f]\)|[A-Fa-f][\.\)\:\-]\s+))|$)/gi;
    const inlineOptionRegex = hasUppercaseOptions
      ? /(?:^|\s)(?:\(([A-F])\)|([A-F])[\.\)\:\-])\s+([^\(\n]+?)(?=(?:\s+(?:\([A-F]\)|[A-F][\.\)\:\-]\s+))|$)/g
      : /(?:^|\s)(?:\(([A-Fa-f])\)|([A-Fa-f])[\.\)\:\-])\s+([^\(\n]+?)(?=(?:\s+(?:\([A-Fa-f]\)|[A-Fa-f][\.\)\:\-]\s+))|$)/gi;
    const lineMatches = [];
    let m;
    while ((m = lineOptionRegex.exec(stemText)) !== null) {
      lineMatches.push({
        index: m.index,
        label: (m[1] || m[2]).toUpperCase(),
        text: m[3].trim()
      });
    }
    if (lineMatches.length >= 2 && lineMatches[0].label === "A") {
      const firstOptIdx = lineMatches[0].index;
      const rawStem = stemText.slice(0, firstOptIdx).trim();
      options = lineMatches.map(lm => cleanOptionText(lm.text));
      stemText = cleanQuestionNumberPrefix(rawStem);
    } else {
      const inlineMatches = [];
      while ((m = inlineOptionRegex.exec(stemText)) !== null) {
        inlineMatches.push({
          index: m.index,
          label: (m[1] || m[2]).toUpperCase(),
          text: m[3].trim()
        });
      }
      if (inlineMatches.length >= 2 && inlineMatches[0].label === "A") {
        const firstOptIdx = inlineMatches[0].index;
        const rawStem = stemText.slice(0, firstOptIdx).trim();
        options = inlineMatches.map(im => cleanOptionText(im.text));
        stemText = cleanQuestionNumberPrefix(rawStem);
      }
    }
  }
  // 5. Post-clean: If the last option has an embedded Answer marker (e.g. "Excise duty Correct Answer: C")
  if (options.length > 0) {
    const lastIdx = options.length - 1;
    const lastOptMatch = options[lastIdx].match(/(.*?)(?:\s+(?:Correct\s+)?(?:Answer|Ans|Key)[\:\-\=\.]*\s*(?:\(?([A-Fa-f1-6])\)?|\(?([^\n]+)\)?))\s*$/i);
    if (lastOptMatch) {
      options[lastIdx] = cleanOptionText(lastOptMatch[1].trim());
      if (inlineAnswer === null && !answerText) {
        if (lastOptMatch[2]) {
          const char = lastOptMatch[2].toUpperCase();
          if (char >= "A" && char <= "F") inlineAnswer = char.charCodeAt(0) - 65;
          else if (char >= "1" && char <= "6") inlineAnswer = parseInt(char, 10) - 1;
        } else if (lastOptMatch[3]) {
          answerText = lastOptMatch[3].trim();
        }
      }
    }
    options = options.map(cleanOptionText);
  }
  // If inline answer was embedded in the stem text after options were extracted:
  if (inlineAnswer === null && !answerText) {
    const trailingAnsMatch = stemText.match(/(?:(?:Correct\s+)?(?:Answer|Ans|Key)[\:\-\=\.]*\s*(?:\(([A-Fa-f1-6])\)|([A-Fa-f1-6])))\s*$/i);
    if (trailingAnsMatch) {
      const char = (trailingAnsMatch[1] || trailingAnsMatch[2]).toUpperCase();
      inlineAnswer = char.charCodeAt(0) - 65;
      stemText = stemText.slice(0, trailingAnsMatch.index).trim();
    }
  }
  return { stemText, options, inlineAnswer, answerText, inlineExplanation };
}
/**
 * Remove question number prefix from stem if present (e.g. "1.", "Q. 1)", "(1)")
 */
function cleanQuestionNumberPrefix(text) {
  return text.replace(/^(?:Q(?:ue(?:stion)?)?\.?\s*(?:no\.?)?\s*\d+[\.\)\:\-]|(?:\(\d+\))|\d+[\.\)\:\-])\s*/i, "").trim();
}
/**
 * Classify question into one of the specialized MashQ question types.
 */
function classifyQuestionType(stem, options) {
  const text = (stem || "").trim();
  // 1. Match the Following
  if (/\b(?:match\s+(?:list|column|the\s+following|the\s+pairs)|match\s+each)\b/i.test(text) ||
      (/\b(?:list|column)\s*[-–]?\s*(?:i|1|a)\b/i.test(text) && /\b(?:list|column)\s*[-–]?\s*(?:ii|2|b)\b/i.test(text))) {
    return { type: "match", confidence: 0.95 };
  }
  // 2. Assertion - Reason
  if (/\bassertion\s*(?:\(a\)|a)?\s*[\:\-\.]/i.test(text) && /\breason\s*(?:\(r\)|r)?\s*[\:\-\.]/i.test(text)) {
    return { type: "assertion_reason", confidence: 0.95 };
  }
  // 3. Statement-based MCQ
  // Looks for: Roman numerals (I, II, III, IV) or Arabic (1, 2, 3) followed by "Which of the statements..."
  const hasStatementsKeyword = /\b(?:consider\s+the\s+following\s+statements?|statements?\s+given\s+above|regarding|with\s+reference\s+to)\b/i.test(text);
  const hasRomanSequence = /(?:^|\s)(?:\([I|V|X]+\)|[I|V|X]+[\.\)\:\-])\s+/i.test(text);
  const hasStatementsConclusion = /(?:which\s+of\s+the\s+(?:statements|pairs|above)|which\s+statement)/i.test(text);
  if ((hasStatementsKeyword && (hasRomanSequence || hasStatementsConclusion)) ||
      (hasRomanSequence && hasStatementsConclusion)) {
    return { type: "statement", confidence: 0.9 };
  }
  // 4. Fill in the Blank
  if (/(?:_{3,}|\(_{2,}\)|\.\.\.\s*|\bfill\s+in\s+the\s+blank\b)/i.test(text)) {
    return { type: "fill_in_the_blank", confidence: 0.85 };
  }
  // 5. True / False
  if (options.length === 2) {
    const opt0 = options[0].toLowerCase();
    const opt1 = options[1].toLowerCase();
    if ((opt0 === "true" && opt1 === "false") || (opt0 === "correct" && opt1 === "incorrect")) {
      return { type: "true_false", confidence: 0.95 };
    }
  }
  // 6. Passage-based / Comprehension
  if (/\b(?:read\s+the\s+following\s+passage|based\s+on\s+the\s+passage\s+above)\b/i.test(text)) {
    return { type: "passage_mcq", confidence: 0.85 };
  }
  // 7. Numerical MCQ
  if (/\b(?:\d+\.?\d*\s*(?:%|kg|m\/s|km|cm|m|hours?|minutes?|seconds?|₹|rs\.?|\$))\b/i.test(text) ||
      /[\+\-\*\/=^√∫]\s*\d+/.test(text)) {
    return { type: "numerical_mcq", confidence: 0.75 };
  }
  // Default: Standard MCQ
  return { type: "mcq", confidence: 1.0 };
}
/**
 * Build structured type-specific fields (statements list, matching columns, assertion & reason)
 */
function buildStructuredFields(type, stemText, options) {
  if (type === "statement") {
    return parseStatementsStructure(stemText);
  }
  if (type === "match") {
    return parseMatchStructure(stemText);
  }
  if (type === "assertion_reason") {
    return parseAssertionReasonStructure(stemText);
  }
  return {};
}
/**
 * Parse Statement structure: extracts intro text, statement items (I, II, III...), and conclusion text.
 */
function parseStatementsStructure(text) {
  const conclusionMatch = text.match(/((?:Which\s+(?:of\s+the|of\s+these|among)?\s+statements?[^?:]*[\?:])|Select\s+the\s+correct\s+code[^:]*:?)\s*$/i);
  let intro = text;
  let conclusion = "";
  if (conclusionMatch) {
    conclusion = conclusionMatch[1].trim();
    intro = text.slice(0, conclusionMatch.index).trim();
  }
  // Extract statement items: I., II., III. or (1), (2), (3)
  const stmtRegex = /(?:^|\s)(?:([I|V|X|i|v|x]+|\d{1,2})[\.\)\:\-]|(?:\(([I|V|X|i|v|x]+|\d{1,2})\)))\s+([\s\S]*?)(?=(?:\s+(?:[I|V|X|i|v|x]+|\d{1,2})[\.\)\:\-]|(?:\([I|V|X|i|v|x]+|\d{1,2}\)))|$)/g;
  const statements = [];
  let m;
  while ((m = stmtRegex.exec(intro)) !== null) {
    statements.push({
      label: (m[1] || m[2]).trim(),
      text: m[3].trim()
    });
  }
  let introText = intro;
  if (statements.length > 0) {
    const firstIdx = intro.search(/(?:^|\s)(?:(?:[I|V|X|i|v|x]+|\d{1,2})[\.\)\:\-]|(?:\([I|V|X|i|v|x]+|\d{1,2}\)))\s+/);
    if (firstIdx !== -1) {
      introText = intro.slice(0, firstIdx).trim();
    }
  }
  return {
    intro: introText || "Consider the following statements:",
    statements: statements.length >= 2 ? statements : [],
    conclusion: conclusion || "Which of the statements given above is/are correct?"
  };
}
/**
 * Parse Match-the-following structure:
 * Extracts intro, List I items, List II items, and conclusion.
 */
function parseMatchStructure(text) {
  // 1. Tab-delimited table check (from table copy-paste)
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  let tabHdrIdx = -1;
  for (let idx = 0; idx < lines.length; idx++) {
    const l = lines[idx];
    if (l.includes("\t") && /\b(?:List|Column|Group)\s*[-–]?(?:I|1|A)\b/i.test(l)) {
      tabHdrIdx = idx;
      break;
    }
  }
  if (tabHdrIdx !== -1) {
    const introText = lines.slice(0, tabHdrIdx).join(" ").trim();
    const hdrs = lines[tabHdrIdx].split("\t").map(h => h.trim()).filter(Boolean);
    if (hdrs.length >= 2) {
      const h1 = hdrs[0];
      const h2 = hdrs[1];
      const tItems1 = [];
      const tItems2 = [];
      let conclusion = "Codes:";
      for (let i = tabHdrIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("\t")) {
          const parts = line.split("\t").map(p => p.trim());
          const col1 = parts[0] || "";
          const col2 = parts[1] || "";
          const m1 = col1.match(/^(?:([a-zA-Z0-9]+)[\.\)\:\-]|(?:\(([a-zA-Z0-9]+)\)))\s*(.*)/);
          tItems1.push({ label: m1 ? (m1[1] || m1[2]) : "", text: m1 ? m1[3].trim() : col1 });
          const m2 = col2.match(/^(?:([a-zA-Z0-9]+)[\.\)\:\-]|(?:\(([a-zA-Z0-9]+)\)))\s*(.*)/);
          tItems2.push({ label: m2 ? (m2[1] || m2[2]) : "", text: m2 ? m2[3].trim() : col2 });
        } else if (/(?:Codes?|Choose\s+the|Select\s+the|Which\s+of)/i.test(line)) {
          conclusion = line.trim();
        }
      }
      if (tItems1.length >= 2 && tItems2.length >= 2) {
        return {
          intro: introText || "Match List I with List II:",
          heading1: h1,
          heading2: h2,
          items1: tItems1,
          items2: tItems2,
          listA: tItems1,
          listB: tItems2,
          conclusion: conclusion || "Codes:"
        };
      }
    }
  }

  // 2. Extract leading intro sentence: e.g. "Match List I (...) with List II (...):"
  const introMatch = text.match(/^(?:.*?\bmatch\s+(?:list|column|the\s+following|the\s+pairs)[^\n:]*[:.]?)\s*/i);
  let introText = "";
  let remainder = text;
  if (introMatch) {
    introText = introMatch[0].trim();
    remainder = text.slice(introMatch[0].length).trim();
  }

  // 3. Search for List I header
  const l1Regex = /(?:^|\n|\b)((?:List|Column|Group|Set)\s*[-–]?\s*(?:I|1|A)(?:\s*\([^\)]+\))?)\s*[:.-]?/i;
  let l1M = remainder.match(l1Regex);
  if (!l1M) {
    l1M = text.match(l1Regex);
    remainder = text;
    if (l1M) {
      introText = text.slice(0, l1M.index).trim();
      remainder = text.slice(l1M.index);
      l1M = remainder.match(l1Regex);
    }
  }
  if (!l1M) {
    return {
      intro: introText || text,
      listA: [],
      listB: [],
      items1: [],
      items2: [],
      conclusion: ""
    };
  }

  let h1Raw = l1M[1].trim();
  const afterL1 = remainder.slice(l1M.index + l1M[0].length).trim();

  // 4. Search for List II header
  const l2Regex = /(?:^|\n|\b)((?:List|Column|Group|Set)\s*[-–]?\s*(?:II|2|B)(?:\s*\([^\)]+\))?)\s*[:.-]?/i;
  const l2M = afterL1.match(l2Regex);
  if (!l2M) {
    return {
      intro: introText || text,
      listA: [],
      listB: [],
      items1: [],
      items2: [],
      conclusion: ""
    };
  }

  let h2Raw = l2M[1].trim();
  const block1 = afterL1.slice(0, l2M.index).trim();
  const afterL2 = afterL1.slice(l2M.index + l2M[0].length).trim();

  // 5. Search for conclusion / codes prompt at end of afterL2
  const concRegex = /((?:Codes?|Choose\s+the|Select\s+the|Which\s+of)[\s\S]*?[:.]?)\s*$/i;
  const concM = afterL2.match(concRegex);
  let block2 = afterL2;
  let conclusion = "Codes:";
  if (concM) {
    conclusion = concM[1].trim();
    block2 = afterL2.slice(0, concM.index).trim();
  }

  // 6. Extract items from block1 and block2
  function extractItems(block) {
    const numMatches = [];
    const alphaMatches = [];
    const romanMatches = [];
    const numRe = /(?:^|\s)(?:(\d{1,2})[\.\)\:\-]|(?:\((\d{1,2})\)))\s+/g;
    const alphaRe = /(?:^|\s)(?:([a-zA-Z])[\.\)\:\-]|(?:\(([a-zA-Z])\)))\s+/g;
    const romanRe = /(?:^|\s)(?:(i|ii|iii|iv|v|vi|vii|viii|ix|x)[\.\)\:\-]|(?:\((i|ii|iii|iv|v|vi|vii|viii|ix|x)\)))\s+/gi;

    let m;
    while ((m = numRe.exec(block)) !== null) numMatches.push({ index: m.index, end: numRe.lastIndex, val: m[1] || m[2] });
    while ((m = alphaRe.exec(block)) !== null) alphaMatches.push({ index: m.index, end: alphaRe.lastIndex, val: m[1] || m[2] });
    while ((m = romanRe.exec(block)) !== null) romanMatches.push({ index: m.index, end: romanRe.lastIndex, val: m[1] || m[2] });

    function filterSeq(matches, mode) {
      if (matches.length < 2) return [];
      const res = [];
      let exp = 1;
      const romanList = ["i","ii","iii","iv","v","vi","vii","viii","ix","x"];
      for (const item of matches) {
        if (mode === "num") {
          const n = parseInt(item.val, 10);
          if (n === exp) { res.push(item); exp++; }
        } else if (mode === "alpha") {
          const c = item.val.toUpperCase();
          if (c === String.fromCharCode(65 + (exp - 1))) { res.push(item); exp++; }
        } else if (mode === "roman") {
          if (exp - 1 < romanList.length && item.val.toLowerCase() === romanList[exp - 1]) { res.push(item); exp++; }
        }
      }
      return res;
    }

    const validNums = filterSeq(numMatches, "num");
    const validAlphas = filterSeq(alphaMatches, "alpha");
    const validRomans = filterSeq(romanMatches, "roman");

    let chosen = [];
    if (validNums.length >= 2 && validNums.length >= validAlphas.length && validNums.length >= validRomans.length) {
      chosen = validNums;
    } else if (validAlphas.length >= 2 && validAlphas.length >= validRomans.length) {
      chosen = validAlphas;
    } else if (validRomans.length >= 2) {
      chosen = validRomans;
    } else {
      const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        return lines.map((line, idx) => {
          const lm = line.match(/^(?:([a-zA-Z0-9]+)[\.\)\:\-]|(?:\(([a-zA-Z0-9]+)\)))\s*(.*)/);
          return {
            label: lm ? (lm[1] || lm[2]) : String(idx + 1),
            text: lm ? lm[3].trim() : line
          };
        });
      }
      return [];
    }

    const items = [];
    for (let i = 0; i < chosen.length; i++) {
      const cur = chosen[i];
      const start = cur.end;
      const end = (i + 1 < chosen.length) ? chosen[i + 1].index : block.length;
      items.push({
        label: cur.val,
        text: block.slice(start, end).trim()
      });
    }
    return items;
  }

  const items1 = extractItems(block1);
  const items2 = extractItems(block2);
  if (items1.length < 2 || items2.length < 2) {
    return {
      intro: introText || text,
      listA: [],
      listB: [],
      items1: [],
      items2: [],
      conclusion: ""
    };
  }

  // Enrich headers with parenthetical descriptions if present in intro sentence
  if (!h1Raw.includes("(")) {
    const m1 = introText.match(/List\s*[-–]?\s*(?:I|1|A)\s*\(([^\)]+)\)/i);
    if (m1) h1Raw = `${h1Raw} (${m1[1].trim()})`;
  }
  if (!h2Raw.includes("(")) {
    const m2 = introText.match(/List\s*[-–]?\s*(?:II|2|B)\s*\(([^\)]+)\)/i);
    if (m2) h2Raw = `${h2Raw} (${m2[1].trim()})`;
  }

  return {
    intro: introText || "Match List I with List II:",
    heading1: h1Raw,
    heading2: h2Raw,
    items1,
    items2,
    listA: items1,
    listB: items2,
    conclusion: conclusion || "Codes:"
  };
}
/**
 * Parse Assertion-Reason structure: extracts Assertion (A) and Reason (R).
 */
function parseAssertionReasonStructure(text) {
  const aMatch = text.match(/\bAssertion\s*(?:\([Aa]\)|[Aa])?\s*[\:\-\.]\s*([\s\S]*?)(?=\bReason\b|$)/i);
  const rMatch = text.match(/\bReason\s*(?:\([Rr]\)|[Rr])?\s*[\:\-\.]\s*([\s\S]*?)(?=(?:Choose|Select|Which|$))/i);
  const concMatch = text.match(/((?:Choose|Select|Which)[^:]*[\?:])\s*$/i);
  return {
    assertion: aMatch ? aMatch[1].trim() : "",
    reason: rMatch ? rMatch[1].trim() : "",
    conclusion: concMatch ? concMatch[1].trim() : "Choose the correct answer from the options below:"
  };
}
/**
 * Format question text cleanly so existing app test renderer
 * (renderFormattedQuestion in app.js) recognizes statements & match columns natively.
 */
function formatQuestionTextForRendering(type, rawStem, structured) {
  if (type === "match" && structured.listA && structured.listA.length > 0) {
    const h1 = structured.heading1 || "List I";
    const h2 = structured.heading2 || "List II";
    let out = `${structured.intro}\n\n${h1}:\n`;
    structured.listA.forEach(it => {
      let lbl = (it.label || "").trim();
      if (lbl && !lbl.endsWith(".") && !lbl.endsWith(")")) {
        lbl = /^[a-zA-Z]$/.test(lbl) ? `${lbl})` : `${lbl}.`;
      }
      out += `${lbl ? lbl + " " : ""}${it.text}\n`;
    });
    out += `\n${h2}:\n`;
    structured.listB.forEach(it => {
      let lbl = (it.label || "").trim();
      if (lbl && !lbl.endsWith(".") && !lbl.endsWith(")")) {
        lbl = /^[a-zA-Z]$/.test(lbl) ? `${lbl})` : `${lbl}.`;
      }
      out += `${lbl ? lbl + " " : ""}${it.text}\n`;
    });
    if (structured.conclusion) {
      out += `\n${structured.conclusion}`;
    }
    return out;
  }
  if (type === "statement" && structured.statements && structured.statements.length > 0) {
    let out = `${structured.intro}\n\n`;
    structured.statements.forEach(st => {
      out += `${st.label}. ${st.text}\n`;
    });
    if (structured.conclusion) {
      out += `\n${structured.conclusion}`;
    }
    return out;
  }
  if (type === "assertion_reason" && structured.assertion && structured.reason) {
    return `Assertion (A): ${structured.assertion}\nReason (R): ${structured.reason}\n\n${structured.conclusion}`;
  }
  return rawStem;
}
// ============================================================
// STAGE 6: VALIDATION & DUPLICATE DETECTION
// ============================================================
/**
 * Validate each parsed question record and assign confidence state:
 * - 'ready': Valid question stem, >= 2 options, valid correctIndex.
 * - 'review': Missing answer, or single option, or ambiguous structure.
 * - 'incomplete': Missing question text entirely.
 */
export function validateAndScoreQuestion(q) {
  const warnings = [];
  if (!q.text || !q.text.trim()) {
    warnings.push("Question stem is missing.");
    return { status: "incomplete", warnings };
  }
  if (!q.options || q.options.length < 2) {
    warnings.push(`Only found ${q.options ? q.options.length : 0} options (minimum 2 required).`);
    return { status: "incomplete", warnings };
  }
  if (q.correctIndex === null || q.correctIndex === undefined || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
    warnings.push("Answer is unresolved. Please select the correct option before importing.");
    return { status: "review", warnings };
  }
  if (q.questionType === "match" && (!q.structured.listA || q.structured.listA.length < 2)) {
    warnings.push("Match columns could not be completely separated. Please verify the matching lists.");
    return { status: "review", warnings };
  }
  return { status: "ready", warnings };
}
/**
 * Detect duplicates within the import batch and against existing Firestore questions.
 */
export function detectDuplicates(questions, existingQuestions = []) {
  const seenFingerprints = new Map();
  function getFingerprint(text) {
    return (text || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 100);
  }
  // Register existing questions from target test
  const existingSet = new Set();
  existingQuestions.forEach(eq => {
    existingSet.add(getFingerprint(eq.text));
  });
  return questions.map(q => {
    const fp = getFingerprint(q.text);
    const warnings = [...(q.warnings || [])];
    let isDuplicate = false;
    if (existingSet.has(fp)) {
      warnings.push("Warning: This question appears to already exist in this test.");
      isDuplicate = true;
    } else if (seenFingerprints.has(fp)) {
      warnings.push(`Warning: Duplicate of Question #${seenFingerprints.get(fp) + 1} in this batch.`);
      isDuplicate = true;
    } else {
      seenFingerprints.set(fp, q.index);
    }
    return {
      ...q,
      isDuplicate,
      warnings
    };
  });
}
// ============================================================
// STAGE 7: MAIN PIPELINE CONTROLLER
// ============================================================
/**
 * Universal Question Import Pipeline
 * Takes raw string input from any source, runs extraction, normalization,
 * answer key extraction, boundary segmentation, classification, and validation.
 */
export function runQuestionImportPipeline(rawInput, existingQuestions = []) {
  if (!rawInput || !rawInput.trim()) {
    return {
      questions: [],
      summary: {
        total: 0,
        ready: 0,
        review: 0,
        incomplete: 0,
        byType: {},
        duplicates: 0
      }
    };
  }
  // 1. Normalization
  const normalized = normalizeText(rawInput);
  // 2. Separate end-of-document Answer Key
  const { mainText, answerKeyMap } = separateAnswerKey(normalized);
  // 3. Question boundary segmentation
  const segments = segmentQuestions(mainText);
  // 4. Classify and extract each question
  const parsedQuestions = segments.map((seg, idx) => {
    const q = classifyAndExtractQuestion(seg, answerKeyMap);
    q.index = idx;
    
    // Validate
    const { status, warnings } = validateAndScoreQuestion(q);
    q.status = status;
    q.warnings = warnings;
    q.selected = status !== "incomplete"; // Auto-select ready and review items
    return q;
  });
  // 5. Duplicate detection
  const finalQuestions = detectDuplicates(parsedQuestions, existingQuestions);
  // 6. Calculate summary metrics
  const summary = {
    total: finalQuestions.length,
    ready: finalQuestions.filter(q => q.status === "ready" && !q.isDuplicate).length,
    review: finalQuestions.filter(q => q.status === "review" || q.isDuplicate).length,
    incomplete: finalQuestions.filter(q => q.status === "incomplete").length,
    duplicates: finalQuestions.filter(q => q.isDuplicate).length,
    byType: {}
  };
  finalQuestions.forEach(q => {
    summary.byType[q.questionType] = (summary.byType[q.questionType] || 0) + 1;
  });
  return {
    questions: finalQuestions,
    summary
  };
}
