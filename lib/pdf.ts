/**
 * Client-side PDF export using pdf-lib.
 *
 * The output is a branded, tabular audit report — Meridian wordmark in the
 * header, "Built by Arunim's IT Caffe" credit in the footer, page numbers,
 * date stamp, alternating row shading, and a discrete READ-ONLY watermark.
 *
 * pdf-lib runs entirely in the browser so no Workers CPU is spent on
 * rendering; downloads are instant even for large tables.
 */

import { PDFDocument, rgb, StandardFonts, degrees, type PDFPage, type PDFFont } from "pdf-lib";
import { triggerDownload } from "./csv";
import { BRAND } from "./brand";

export interface PdfColumn<T> {
  header: string;
  accessor: (row: T) => string;
  /** Relative width weight. Defaults to 1 for all columns. */
  weight?: number;
}

export interface PdfExportOptions {
  title: string;
  subtitle?: string;
  filename: string;
}

/* ------------------------------------------------------------
 * Colour palette — mirrors the app's Azure-blue accent but tuned
 * for print-quality contrast at 72 dpi.
 * ------------------------------------------------------------*/
const C = {
  primary: rgb(34 / 255, 108 / 255, 195 / 255),     // #226CC3 muted Azure blue
  primaryDark: rgb(24 / 255, 79 / 255, 143 / 255),  // header accent
  ink: rgb(37 / 255, 43 / 255, 56 / 255),           // body text
  inkMuted: rgb(97 / 255, 105 / 255, 122 / 255),    // secondary text
  border: rgb(215 / 255, 219 / 255, 226 / 255),     // table grid
  rowAlt: rgb(247 / 255, 248 / 255, 251 / 255),     // zebra row
  success: rgb(38 / 255, 125 / 255, 92 / 255),
  bgTint: rgb(250 / 255, 250 / 255, 247 / 255),     // very subtle background
  white: rgb(1, 1, 1),
};

/* ------------------------------------------------------------
 * Page geometry (A4 portrait)
 * ------------------------------------------------------------*/
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 44;
const HEADER_H = 72;      // top brand bar
const FOOTER_H = 54;      // bottom credit bar
const ROW_H = 18;
const HEADER_ROW_H = 22;

export async function exportPdfTable<T>(
  rows: T[],
  columns: PdfColumn<T>[],
  options: PdfExportOptions,
): Promise<void> {
  const doc = await PDFDocument.create();
  doc.setTitle(options.title);
  doc.setAuthor("Arunim's IT Caffe");
  doc.setSubject(`${BRAND.name} — read-only Azure report`);
  doc.setCreator(`${BRAND.name} v${BRAND.version}`);
  doc.setProducer(`${BRAND.name}`);
  doc.setCreationDate(new Date());

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);

  const totalWeight = columns.reduce((s, c) => s + (c.weight ?? 1), 0);
  const usable = PAGE_W - MARGIN_X * 2;
  const colWidths = columns.map((c) => ((c.weight ?? 1) / totalWeight) * usable);

  // Page-1 title block takes ~68 px, subsequent pages continue the table
  // slightly higher.
  const firstPageTitleH = 82;

  const timestamp = new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  // ---------------- Pagination ----------------
  const pages: Array<{ rows: T[]; isFirst: boolean }> = [];
  const firstPageCapacity = Math.max(
    1,
    Math.floor(
      (PAGE_H - HEADER_H - firstPageTitleH - FOOTER_H - HEADER_ROW_H) / ROW_H,
    ),
  );
  const restCapacity = Math.max(
    1,
    Math.floor((PAGE_H - HEADER_H - FOOTER_H - HEADER_ROW_H - 20) / ROW_H),
  );

  if (rows.length === 0) {
    pages.push({ rows: [], isFirst: true });
  } else {
    let i = 0;
    pages.push({ rows: rows.slice(i, i + firstPageCapacity), isFirst: true });
    i += firstPageCapacity;
    while (i < rows.length) {
      pages.push({ rows: rows.slice(i, i + restCapacity), isFirst: false });
      i += restCapacity;
    }
  }

  // ---------------- Draw each page ----------------
  pages.forEach((chunk, pageIndex) => {
    const page = doc.addPage([PAGE_W, PAGE_H]);

    // Subtle page-tint
    page.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_W,
      height: PAGE_H,
      color: C.bgTint,
    });

    /* -----------------------------------
     * Diagonal READ-ONLY watermark
     * Very faint so it doesn't fight the data but is visible on printouts.
     * -----------------------------------*/
    page.drawText("READ-ONLY", {
      x: PAGE_W / 2 - 220,
      y: PAGE_H / 2 - 60,
      size: 96,
      font: bold,
      color: rgb(210 / 255, 214 / 255, 222 / 255),
      opacity: 0.16,
      rotate: degrees(-28),
    });

    /* -----------------------------------
     * Header — Meridian wordmark + tagline + date + read-only chip
     * -----------------------------------*/
    // Thin top accent
    page.drawRectangle({
      x: 0,
      y: PAGE_H - 3,
      width: PAGE_W,
      height: 3,
      color: C.primary,
    });
    // Header container
    page.drawRectangle({
      x: 0,
      y: PAGE_H - HEADER_H,
      width: PAGE_W,
      height: HEADER_H - 3,
      color: C.white,
    });
    // Thin bottom border under header
    page.drawRectangle({
      x: 0,
      y: PAGE_H - HEADER_H,
      width: PAGE_W,
      height: 0.75,
      color: C.border,
    });

    // Wordmark — big serif on the left
    page.drawText(BRAND.name, {
      x: MARGIN_X,
      y: PAGE_H - 40,
      size: 22,
      font: serif,
      color: C.ink,
    });
    // Tagline underneath the wordmark
    page.drawText(BRAND.taglineShort.toUpperCase(), {
      x: MARGIN_X,
      y: PAGE_H - 56,
      size: 6.5,
      font: bold,
      color: C.inkMuted,
      // simulate letter-spacing by hand-kerning is overkill; just draw
    });

    // Right side — date + read-only chip
    const dateText = timestamp;
    const dateW = font.widthOfTextAtSize(dateText, 8.5);
    page.drawText(dateText, {
      x: PAGE_W - MARGIN_X - dateW,
      y: PAGE_H - 30,
      size: 8.5,
      font,
      color: C.inkMuted,
    });
    // READ-ONLY pill
    const pillText = "READ-ONLY";
    const pillTextW = bold.widthOfTextAtSize(pillText, 7.5);
    const pillW = pillTextW + 14;
    const pillH = 14;
    const pillX = PAGE_W - MARGIN_X - pillW;
    const pillY = PAGE_H - 52;
    page.drawRectangle({
      x: pillX,
      y: pillY,
      width: pillW,
      height: pillH,
      color: rgb(232 / 255, 244 / 255, 236 / 255),
    });
    page.drawText(pillText, {
      x: pillX + 7,
      y: pillY + 4,
      size: 7.5,
      font: bold,
      color: C.success,
    });

    /* -----------------------------------
     * Title block (first page only)
     * -----------------------------------*/
    let contentTop = PAGE_H - HEADER_H - 20;
    if (chunk.isFirst) {
      page.drawText(sanitizeForPdf(options.title), {
        x: MARGIN_X,
        y: PAGE_H - HEADER_H - 28,
        size: 18,
        font: bold,
        color: C.ink,
      });
      if (options.subtitle) {
        page.drawText(sanitizeForPdf(options.subtitle), {
          x: MARGIN_X,
          y: PAGE_H - HEADER_H - 46,
          size: 9,
          font: oblique,
          color: C.inkMuted,
        });
      }
      // Meta row
      const metaParts = [
        `${rows.length} record${rows.length === 1 ? "" : "s"}`,
        `${columns.length} column${columns.length === 1 ? "" : "s"}`,
        `Generated ${timestamp}`,
      ];
      page.drawText(metaParts.join("   ·   "), {
        x: MARGIN_X,
        y: PAGE_H - HEADER_H - 64,
        size: 8.5,
        font,
        color: C.inkMuted,
      });
      contentTop = PAGE_H - HEADER_H - firstPageTitleH;
    }

    /* -----------------------------------
     * Table header row
     * -----------------------------------*/
    let y = contentTop;
    let x = MARGIN_X;
    page.drawRectangle({
      x: MARGIN_X,
      y: y - HEADER_ROW_H,
      width: usable,
      height: HEADER_ROW_H,
      color: C.primaryDark,
    });
    columns.forEach((col, idx) => {
      const text = truncateForCell(col.header, colWidths[idx], bold, 8);
      page.drawText(text, {
        x: x + 6,
        y: y - HEADER_ROW_H + 7.5,
        size: 8,
        font: bold,
        color: C.white,
      });
      x += colWidths[idx];
    });
    y -= HEADER_ROW_H;

    /* -----------------------------------
     * Table rows
     * -----------------------------------*/
    if (chunk.rows.length === 0) {
      page.drawText("No records to display.", {
        x: MARGIN_X + 10,
        y: y - 24,
        size: 10,
        font: oblique,
        color: C.inkMuted,
      });
    } else {
      chunk.rows.forEach((row, rowIdx) => {
        const rowY = y - ROW_H;
        if (rowIdx % 2 === 1) {
          page.drawRectangle({
            x: MARGIN_X,
            y: rowY,
            width: usable,
            height: ROW_H,
            color: C.rowAlt,
          });
        }
        let cx = MARGIN_X;
        columns.forEach((col, idx) => {
          const value = truncateForCell(
            col.accessor(row) ?? "",
            colWidths[idx],
            font,
            7.5,
          );
          page.drawText(value, {
            x: cx + 6,
            y: rowY + 5.5,
            size: 7.5,
            font,
            color: C.ink,
          });
          cx += colWidths[idx];
        });
        page.drawLine({
          start: { x: MARGIN_X, y: rowY },
          end: { x: MARGIN_X + usable, y: rowY },
          thickness: 0.4,
          color: C.border,
        });
        y = rowY;
      });
    }

    /* -----------------------------------
     * Footer — brand credit + page number
     * -----------------------------------*/
    // Footer separator
    page.drawRectangle({
      x: 0,
      y: FOOTER_H,
      width: PAGE_W,
      height: 0.75,
      color: C.border,
    });
    // Footer container
    page.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_W,
      height: FOOTER_H,
      color: C.white,
    });
    // Bottom accent line
    page.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_W,
      height: 3,
      color: C.primary,
    });

    // Left: brand credit
    page.drawText(BRAND.name, {
      x: MARGIN_X,
      y: 32,
      size: 10,
      font: serif,
      color: C.ink,
    });
    page.drawText(`${BRAND.attribution} · ${BRAND.host}`, {
      x: MARGIN_X,
      y: 18,
      size: 7.5,
      font,
      color: C.inkMuted,
    });

    // Center: page number
    const pageLabel = `Page ${pageIndex + 1} of ${pages.length}`;
    const pageLabelW = font.widthOfTextAtSize(pageLabel, 8);
    page.drawText(pageLabel, {
      x: (PAGE_W - pageLabelW) / 2,
      y: 22,
      size: 8,
      font,
      color: C.inkMuted,
    });

    // Right: version + read-only reminder
    const versionText = `v${BRAND.version}  ·  READ-ONLY REPORT`;
    const versionW = font.widthOfTextAtSize(versionText, 7.5);
    page.drawText(versionText, {
      x: PAGE_W - MARGIN_X - versionW,
      y: 22,
      size: 7.5,
      font,
      color: C.inkMuted,
    });
  });

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  triggerDownload(
    blob,
    options.filename.endsWith(".pdf") ? options.filename : `${options.filename}.pdf`,
  );
}

/**
 * Map characters that the StandardFonts WinAnsi encoding cannot represent to
 * safe ASCII equivalents. pdf-lib THROWS when asked to draw an unencodable
 * character (e.g. "≤", "→", "✓"), which — if the caller swallows the error —
 * silently aborts the whole PDF download. Sanitising here means a stray glyph
 * degrades to a readable fallback instead of breaking report generation.
 */
const WINANSI_REPLACEMENTS: Record<string, string> = {
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  "≈": "~",
  "→": "->",
  "←": "<-",
  "↔": "<->",
  "⇒": "=>",
  "⇐": "<=",
  "×": "x",
  "÷": "/",
  "✓": "[x]",
  "✔": "[x]",
  "✗": "[ ]",
  "✘": "[ ]",
  "★": "*",
  "☆": "*",
  "•": "-",
};

/** Typographic characters that ARE representable in WinAnsi (CP1252). */
const WINANSI_EXTRAS =
  "\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026" +
  "\u2030\u2039\u203A\u20AC\u2122\u0160\u0161\u017D\u017E\u0152\u0153\u0192";

export function sanitizeForPdf(text: string): string {
  if (!text) return "";
  let out = "";
  for (const ch of text) {
    const repl = WINANSI_REPLACEMENTS[ch];
    if (repl !== undefined) {
      out += repl;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || (code >= 0x20 && code <= 0x7e)) {
      out += ch; // tab, newline, printable ASCII
    } else if ((code >= 0xa0 && code <= 0xff) || WINANSI_EXTRAS.includes(ch)) {
      out += ch; // Latin-1 supplement + CP1252 typographic set
    } else {
      out += "?"; // anything else pdf-lib would reject
    }
  }
  return out;
}

/**
 * Truncate a cell value so it fits inside `maxWidthPoints` at the given font
 * and font size. Uses the actual font metrics from pdf-lib so wide characters
 * like "M" or "W" don't overflow, and thin characters like "i" or "l" get
 * to fill the cell.
 */
function truncateForCell(
  rawValue: string,
  maxWidthPoints: number,
  font: import("pdf-lib").PDFFont,
  size: number,
): string {
  const value = sanitizeForPdf(rawValue);
  const budget = maxWidthPoints - 12; // account for cell padding
  if (font.widthOfTextAtSize(value, size) <= budget) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = value.slice(0, mid) + "…";
    if (font.widthOfTextAtSize(candidate, size) <= budget) low = mid + 1;
    else high = mid;
  }
  return value.slice(0, Math.max(1, low - 2)) + "…";
}


/* ============================================================
 * Branded multi-section executive report (exportPdfReport)
 * ============================================================ */

export interface PdfKpi {
  label: string;
  value: string;
}

export interface PdfReportSection {
  heading: string;
  blurb?: string;
  kpis?: PdfKpi[];
  columns?: PdfColumn<Record<string, string>>[];
  rows?: Record<string, string>[];
  /** Cap table rows in the report (executive summary, not a data dump). */
  maxRows?: number;
}

export interface PdfReportOptions {
  title: string;
  preparedFor?: string;
  subscription?: string;
  filename: string;
}

/** Word-wrap `text` to fit `maxWidth` at the given font/size. */
function wrapText(rawText: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const text = sanitizeForPdf(rawText);
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) line = trial;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function exportPdfReport(
  sections: PdfReportSection[],
  options: PdfReportOptions,
): Promise<void> {
  const doc = await PDFDocument.create();
  doc.setTitle(options.title);
  doc.setAuthor(BRAND.parentBrand.name);
  doc.setSubject(`${BRAND.name} — read-only Azure report`);
  doc.setCreator(`${BRAND.name} v${BRAND.version}`);
  doc.setCreationDate(new Date());

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);

  const usable = PAGE_W - MARGIN_X * 2;
  const CONTENT_TOP = PAGE_H - HEADER_H - 24;
  const CONTENT_BOTTOM = FOOTER_H + 18;
  const timestamp = new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const pages: PDFPage[] = [];

  function chrome(page: PDFPage) {
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: C.bgTint });
    page.drawText("READ-ONLY", {
      x: PAGE_W / 2 - 220,
      y: PAGE_H / 2 - 60,
      size: 96,
      font: bold,
      color: rgb(210 / 255, 214 / 255, 222 / 255),
      opacity: 0.14,
      rotate: degrees(-28),
    });
    // Header
    page.drawRectangle({ x: 0, y: PAGE_H - 3, width: PAGE_W, height: 3, color: C.primary });
    page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H - 3, color: C.white });
    page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: 0.75, color: C.border });
    page.drawText(BRAND.name, { x: MARGIN_X, y: PAGE_H - 40, size: 22, font: serif, color: C.ink });
    page.drawText(BRAND.taglineShort.toUpperCase(), { x: MARGIN_X, y: PAGE_H - 56, size: 6.5, font: bold, color: C.inkMuted });
    const dateW = font.widthOfTextAtSize(timestamp, 8.5);
    page.drawText(timestamp, { x: PAGE_W - MARGIN_X - dateW, y: PAGE_H - 30, size: 8.5, font, color: C.inkMuted });
    const pill = "READ-ONLY";
    const pillTextW = bold.widthOfTextAtSize(pill, 7.5);
    const pillW = pillTextW + 14;
    const pillX = PAGE_W - MARGIN_X - pillW;
    page.drawRectangle({ x: pillX, y: PAGE_H - 52, width: pillW, height: 14, color: rgb(232 / 255, 244 / 255, 236 / 255) });
    page.drawText(pill, { x: pillX + 7, y: PAGE_H - 48, size: 7.5, font: bold, color: C.success });
    // Footer
    page.drawRectangle({ x: 0, y: FOOTER_H, width: PAGE_W, height: 0.75, color: C.border });
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: FOOTER_H, color: C.white });
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 3, color: C.primary });
    page.drawText(BRAND.name, { x: MARGIN_X, y: 32, size: 10, font: serif, color: C.ink });
    page.drawText(`${BRAND.attribution} · ${BRAND.host}`, { x: MARGIN_X, y: 18, size: 7.5, font, color: C.inkMuted });
  }

  function addPage(): PDFPage {
    const p = doc.addPage([PAGE_W, PAGE_H]);
    chrome(p);
    pages.push(p);
    return p;
  }

  // ---------------- Cover page ----------------
  let page = addPage();
  const coverTitleLines = wrapText(options.title, usable - 20, bold, 26);
  let cy = PAGE_H / 2 + 90;
  for (const line of coverTitleLines) {
    page.drawText(line, { x: MARGIN_X, y: cy, size: 26, font: bold, color: C.ink });
    cy -= 30;
  }
  cy -= 6;
  page.drawRectangle({ x: MARGIN_X, y: cy, width: 120, height: 2.5, color: C.primary });
  cy -= 26;
  if (options.preparedFor) {
    page.drawText("Prepared for", { x: MARGIN_X, y: cy, size: 8, font: bold, color: C.inkMuted });
    page.drawText(sanitizeForPdf(options.preparedFor), { x: MARGIN_X, y: cy - 15, size: 13, font, color: C.ink });
    cy -= 38;
  }
  if (options.subscription) {
    page.drawText("Subscription", { x: MARGIN_X, y: cy, size: 8, font: bold, color: C.inkMuted });
    page.drawText(sanitizeForPdf(options.subscription), { x: MARGIN_X, y: cy - 15, size: 11, font, color: C.ink });
    cy -= 38;
  }
  page.drawText(`Generated ${timestamp}`, { x: MARGIN_X, y: cy, size: 9, font: oblique, color: C.inkMuted });
  cy -= 16;
  page.drawText("Read-only report · no changes were made to any Azure resource.", {
    x: MARGIN_X,
    y: cy,
    size: 8.5,
    font,
    color: C.inkMuted,
  });

  // ---------------- Section pages ----------------
  page = addPage();
  let y = CONTENT_TOP;
  const ensure = (need: number) => {
    if (y - need < CONTENT_BOTTOM) {
      page = addPage();
      y = CONTENT_TOP;
    }
  };

  for (const section of sections) {
    ensure(46);
    page.drawText(sanitizeForPdf(section.heading), { x: MARGIN_X, y: y - 14, size: 13, font: bold, color: C.primaryDark });
    page.drawRectangle({ x: MARGIN_X, y: y - 20, width: usable, height: 0.75, color: C.border });
    y -= 32;

    if (section.blurb) {
      const lines = wrapText(section.blurb, usable, font, 9);
      for (const line of lines) {
        ensure(13);
        page.drawText(line, { x: MARGIN_X, y: y - 9, size: 9, font, color: C.inkMuted });
        y -= 13;
      }
      y -= 6;
    }

    if (section.kpis && section.kpis.length) {
      const perRow = 4;
      for (let i = 0; i < section.kpis.length; i += perRow) {
        ensure(34);
        const rowKpis = section.kpis.slice(i, i + perRow);
        let kx = MARGIN_X;
        const colW = usable / perRow;
        for (const k of rowKpis) {
          page.drawText(sanitizeForPdf(k.value), { x: kx, y: y - 14, size: 15, font: bold, color: C.ink });
          page.drawText(sanitizeForPdf(k.label), { x: kx, y: y - 25, size: 7, font, color: C.inkMuted });
          kx += colW;
        }
        y -= 36;
      }
    }

    if (section.columns && section.columns.length && section.rows) {
      const cols = section.columns;
      const totalWeight = cols.reduce((s, c) => s + (c.weight ?? 1), 0);
      const colWidths = cols.map((c) => ((c.weight ?? 1) / totalWeight) * usable);
      const drawHeaderRow = () => {
        page.drawRectangle({ x: MARGIN_X, y: y - HEADER_ROW_H, width: usable, height: HEADER_ROW_H, color: C.primaryDark });
        let hx = MARGIN_X;
        cols.forEach((col, idx) => {
          page.drawText(truncateForCell(col.header, colWidths[idx], bold, 8), {
            x: hx + 6,
            y: y - HEADER_ROW_H + 7.5,
            size: 8,
            font: bold,
            color: C.white,
          });
          hx += colWidths[idx];
        });
        y -= HEADER_ROW_H;
      };
      ensure(HEADER_ROW_H + ROW_H);
      drawHeaderRow();
      const capped = section.rows.slice(0, section.maxRows ?? 25);
      capped.forEach((row, rowIdx) => {
        if (y - ROW_H < CONTENT_BOTTOM) {
          page = addPage();
          y = CONTENT_TOP;
          drawHeaderRow();
        }
        const rowY = y - ROW_H;
        if (rowIdx % 2 === 1) {
          page.drawRectangle({ x: MARGIN_X, y: rowY, width: usable, height: ROW_H, color: C.rowAlt });
        }
        let cx = MARGIN_X;
        cols.forEach((col, idx) => {
          page.drawText(truncateForCell(col.accessor(row) ?? "", colWidths[idx], font, 7.5), {
            x: cx + 6,
            y: rowY + 5.5,
            size: 7.5,
            font,
            color: C.ink,
          });
          cx += colWidths[idx];
        });
        page.drawLine({ start: { x: MARGIN_X, y: rowY }, end: { x: MARGIN_X + usable, y: rowY }, thickness: 0.4, color: C.border });
        y = rowY;
      });
      const extra = section.rows.length - capped.length;
      if (extra > 0) {
        ensure(14);
        page.drawText(`+ ${extra} more (see the CSV/detailed export for the full list)`, {
          x: MARGIN_X,
          y: y - 11,
          size: 7.5,
          font: oblique,
          color: C.inkMuted,
        });
        y -= 14;
      }
    }

    y -= 16;
  }

  // ---------------- Page numbers ----------------
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    const w = font.widthOfTextAtSize(label, 8);
    p.drawText(label, { x: (PAGE_W - w) / 2, y: 22, size: 8, font, color: C.inkMuted });
    const vt = `v${BRAND.version}  ·  READ-ONLY REPORT`;
    const vw = font.widthOfTextAtSize(vt, 7.5);
    p.drawText(vt, { x: PAGE_W - MARGIN_X - vw, y: 22, size: 7.5, font, color: C.inkMuted });
  });

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  triggerDownload(blob, options.filename.endsWith(".pdf") ? options.filename : `${options.filename}.pdf`);
}
