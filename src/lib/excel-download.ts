// Downloads an .xlsx built from sheet specs. The Excel library loads only when someone downloads.
import { buildWorkbook, SheetSpec } from './excel-book';

export async function downloadExcel(fileBase: string, sheets: SheetSpec[]): Promise<string> {
  const mod = await import('exceljs');
  const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof import('exceljs');
  const wb = buildWorkbook(ExcelJS, sheets);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fileName = `${fileBase}.xlsx`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}
