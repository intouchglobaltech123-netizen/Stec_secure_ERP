// Excel workbooks for report downloads (browser) and the backup's readable copy (server).
// Pure: the ExcelJS module is passed in, so the same code runs in the browser and in Node.
import type ExcelJSType from 'exceljs';

export type CellType = 'text' | 'number' | 'money' | 'date' | 'datetime' | 'percent';

export interface SheetColumn {
  header: string;
  key: string;
  type?: CellType;
  width?: number;
}

export interface SheetSpec {
  name: string; // tab name (Excel allows 31 characters)
  title?: string; // optional first line above the table, e.g. the report and its dates
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
  // Adds a bold total row for these money / number columns
  totalKeys?: string[];
}

const NUM_FMT: Partial<Record<CellType, string>> = {
  number: '#,##0',
  money: '#,##0.00',
  date: 'dd-mmm-yyyy',
  datetime: 'dd-mmm-yyyy hh:mm',
  percent: '0%',
};

// India calendar date 'YYYY-MM-DD' (or a timestamp) → a Date Excel shows as that same day / time in India
function toExcelDate(value: unknown, withTime: boolean): Date | null {
  if (typeof value !== 'string' || !value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  // Excel has no time zones: shift so the sheet shows India time
  const ist = new Date(t + 330 * 60_000);
  return withTime ? ist : new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

function cellValue(value: unknown, type: CellType = 'text'): ExcelJSType.CellValue {
  if (value === undefined || value === null || value === '') return null;
  switch (type) {
    case 'number':
    case 'money':
    case 'percent': {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? n : String(value);
    }
    case 'date':
    case 'datetime':
      return toExcelDate(value, type === 'datetime') ?? String(value);
    default:
      return String(value);
  }
}

// Excel tab names: no []:*?/\ and at most 31 characters
const safeSheetName = (name: string) => name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet';

export function buildWorkbook(ExcelJS: typeof ExcelJSType, sheets: SheetSpec[]): ExcelJSType.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'S Tec Secure ERP';
  wb.created = new Date();

  for (const spec of sheets) {
    const ws = wb.addWorksheet(safeSheetName(spec.name));
    const colCount = spec.columns.length;
    let headerRowNo = 1;

    if (spec.title) {
      ws.addRow([spec.title]);
      ws.mergeCells(1, 1, 1, Math.max(1, colCount));
      const titleCell = ws.getCell(1, 1);
      titleCell.font = { bold: true, size: 13, color: { argb: 'FF9A3412' } };
      ws.addRow([]);
      headerRowNo = 3;
    }

    const header = ws.addRow(spec.columns.map((c) => c.header));
    header.font = { bold: true, color: { argb: 'FF0F172A' } };
    header.alignment = { vertical: 'middle', wrapText: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFEA580C' } } };
    });

    for (const row of spec.rows) {
      ws.addRow(spec.columns.map((c) => cellValue(row[c.key], c.type)));
    }

    if (spec.totalKeys?.length && spec.rows.length) {
      const totals = spec.columns.map((c, i) => {
        if (i === 0) return 'Total';
        if (!spec.totalKeys!.includes(c.key)) return null;
        return spec.rows.reduce((sum, r) => sum + (Number(r[c.key]) || 0), 0);
      });
      const totalRow = ws.addRow(totals);
      totalRow.font = { bold: true };
      totalRow.eachCell((cell) => {
        cell.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } };
      });
    }

    spec.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      const fmt = c.type ? NUM_FMT[c.type] : undefined;
      if (fmt) col.numFmt = fmt;
      // Width from the header and the longest value, within sensible limits
      const longest = Math.max(
        c.header.length,
        ...spec.rows.slice(0, 500).map((r) => String(r[c.key] ?? '').length)
      );
      col.width = c.width ?? Math.min(48, Math.max(c.type === 'date' ? 13 : 10, longest + 2));
    });

    ws.views = [{ state: 'frozen', ySplit: headerRowNo }];
    if (spec.rows.length) {
      ws.autoFilter = { from: { row: headerRowNo, column: 1 }, to: { row: headerRowNo, column: colCount } };
    }
  }
  return wb;
}
