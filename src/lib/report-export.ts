// Report downloads in three formats from the same sheet descriptions (SheetSpec):
//  - Excel (.xlsx): every sheet as a tab, real dates and numbers, totals row
//  - CSV: every sheet one after another in one file (opens in Excel; UTF-8 with BOM so ₹ shows)
//  - PDF: landscape A4 tables with the company name, report title and period; columns marked
//    `pdf: false` are left out so the table stays readable
// The Excel and PDF libraries load only when someone downloads.
import type { SheetColumn, SheetSpec } from './excel-book';
import { downloadExcel } from './excel-download';
import { COMPANY_DETAILS } from './stecsecure-types';

export type ExportFormat = 'xlsx' | 'csv' | 'pdf';

export interface ReportExport {
  fileBase: string; // file name without extension
  title: string; // shown at the top of the PDF
  period?: string; // e.g. "01 Apr 2026 – 16 Oct 2026"
  sheets: SheetSpec[];
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// India calendar date or timestamp → "16 Oct 2026" (with time for timestamps when asked)
function showDate(value: unknown, withTime: boolean): string {
  if (typeof value !== 'string' || !value) return '';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dateOnly ? `${value}T12:00:00+05:30` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime && !dateOnly ? { hour: '2-digit', minute: '2-digit', hour12: true } : {}),
  });
}

const indian = (n: number, decimals: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

function showCell(value: unknown, col: SheetColumn): string {
  if (value === undefined || value === null || value === '') return '';
  switch (col.type) {
    case 'money':
      return typeof value === 'number' ? indian(value, 2) : String(value);
    case 'number':
      return typeof value === 'number' ? indian(value, Number.isInteger(value) ? 0 : 1) : String(value);
    case 'percent':
      return typeof value === 'number' ? `${Math.round(value * 100)}%` : String(value);
    case 'date':
      return showDate(value, false);
    case 'datetime':
      return showDate(value, true);
    default:
      return String(value);
  }
}

function totalsFor(sheet: SheetSpec): Record<string, number> | null {
  if (!sheet.totalKeys?.length || !sheet.rows.length) return null;
  const totals: Record<string, number> = {};
  for (const key of sheet.totalKeys) totals[key] = sheet.rows.reduce((sum, r) => sum + (Number(r[key]) || 0), 0);
  return totals;
}

// ---------- CSV ----------
function csvFile(report: ReportExport): Blob {
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines: string[] = [];
  report.sheets.forEach((sheet, i) => {
    if (report.sheets.length > 1) {
      if (i > 0) lines.push('');
      lines.push(esc(sheet.title || sheet.name));
    }
    lines.push(sheet.columns.map((c) => esc(c.header)).join(','));
    for (const row of sheet.rows) {
      lines.push(
        sheet.columns
          .map((c) => {
            const v = row[c.key];
            // Plain numbers in CSV so Excel can add them up
            if ((c.type === 'money' || c.type === 'number') && typeof v === 'number') return String(v);
            return esc(showCell(v, c));
          })
          .join(',')
      );
    }
    const totals = totalsFor(sheet);
    if (totals) {
      lines.push(sheet.columns.map((c, j) => (j === 0 ? 'Total' : c.key in totals ? String(totals[c.key]) : '')).join(','));
    }
  });
  return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

// ---------- PDF ----------
// The built-in PDF font has no ₹ or other non-Latin characters: spell them out
function pdfText(v: string): string {
  return v
    .replace(/₹/g, 'Rs')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/×/g, 'x')
    .replace(/…/g, '...')
    .replace(/→/g, '->')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');
}

async function pdfFile(report: ReportExport): Promise<Blob> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const generated = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const header = (first: boolean) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(first ? 14 : 10);
    doc.setTextColor(154, 52, 18);
    doc.text(pdfText(COMPANY_DETAILS.legalName), 12, 12);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(first ? 12 : 9);
    doc.text(pdfText(report.title), 12, first ? 19 : 17);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const sub = [report.period ? `Period: ${report.period}` : '', `Generated: ${generated}`].filter(Boolean).join('   |   ');
    doc.text(pdfText(sub), 12, first ? 24.5 : 21.5);
  };

  let startY = 30;
  header(true);
  report.sheets.forEach((sheet, i) => {
    const cols = sheet.columns.filter((c) => c.pdf !== false);
    const totals = totalsFor(sheet);
    if (report.sheets.length > 1 || sheet.title) {
      if (i > 0) {
        const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY;
        startY = last + 10;
        if (startY > doc.internal.pageSize.getHeight() - 30) {
          doc.addPage();
          header(false);
          startY = 27;
        }
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(pdfText(sheet.title || sheet.name), 12, startY);
      startY += 3;
    }
    const numeric = (c: SheetColumn) => c.type === 'money' || c.type === 'number' || c.type === 'percent';
    autoTable(doc, {
      startY,
      margin: { left: 12, right: 12, top: 27 },
      head: [cols.map((c) => pdfText(c.header))],
      body: sheet.rows.map((r) => cols.map((c) => pdfText(showCell(r[c.key], c)))),
      foot: totals
        ? [cols.map((c, j) => (j === 0 ? 'Total' : c.key in totals ? pdfText(showCell(totals[c.key], c)) : ''))]
        : undefined,
      showFoot: 'lastPage',
      styles: { font: 'helvetica', fontSize: cols.length > 12 ? 6.5 : 8, cellPadding: 1.6, overflow: 'linebreak', textColor: [30, 41, 59] },
      headStyles: { fillColor: [255, 237, 213], textColor: [15, 23, 42], fontStyle: 'bold', lineColor: [234, 88, 12] },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: Object.fromEntries(cols.map((c, j) => [j, numeric(c) ? { halign: 'right' as const } : {}])),
      // Headings and totals line up with the numbers under them
      didParseCell: (data) => {
        if (data.section !== 'body' && numeric(cols[data.column.index])) data.cell.styles.halign = 'right';
      },
      // A table that runs onto a new page gets the short header there
      didDrawPage: (data) => {
        if (data.pageNumber > 1) header(false);
      },
    });
  });

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${p} of ${pages}`, pageW - 12, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
  }
  return doc.output('blob');
}

export async function exportReport(format: ExportFormat, report: ReportExport): Promise<string> {
  if (format === 'xlsx') return downloadExcel(report.fileBase, report.sheets);
  const fileName = `${report.fileBase}.${format}`;
  saveBlob(format === 'csv' ? csvFile(report) : await pdfFile(report), fileName);
  return fileName;
}
