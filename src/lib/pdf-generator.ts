import { toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

/**
 * Sanitizes a string for safe use in file names across Windows, macOS, and Linux.
 * Removes illegal filesystem characters and replaces whitespace with clean separators.
 */
export function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, '') // remove spaces for clean CamelCase / compact names like SankarSecurity
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface ExportPdfOptions {
  filename: string;
  marginMm?: number;
  quality?: number;
}

/**
 * Captures an HTML element and triggers a direct browser download as a formatted A4 PDF.
 * Uses browser-native foreignObject rendering via html-to-image, which natively supports
 * modern CSS Color 4 functions (such as oklch from Tailwind v4), flexbox, grid, and typography.
 */
export async function downloadElementAsPdf(
  element: HTMLElement,
  options: ExportPdfOptions
): Promise<string> {
  const baseName = options.filename.endsWith('.pdf')
    ? options.filename.slice(0, -4)
    : options.filename;
  const cleanFilename = `${sanitizeFileName(baseName)}.pdf`;

  try {
    let canvas: HTMLCanvasElement;
    try {
      canvas = await toCanvas(element, {
        pixelRatio: 2, // 2x for sharp 300 dpi print quality
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
    } catch (renderErr) {
      console.warn('Initial PDF render attempt failed, retrying with skipFonts:', renderErr);
      canvas = await toCanvas(element, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
        skipFonts: true,
      });
    }

    // Standard A4 dimensions in mm
    const a4WidthMm = 210;
    const a4HeightMm = 297;

    const imgWidth = a4WidthMm;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const imgData = canvas.toDataURL('image/jpeg', options.quality ?? 0.96);

    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');

    let remainingHeight = imgHeight - a4HeightMm;

    // Handle multi-page documents seamlessly
    while (remainingHeight > 2) {
      position -= a4HeightMm;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      remainingHeight -= a4HeightMm;
    }

    pdf.save(cleanFilename);
    return cleanFilename;
  } catch (err: any) {
    console.error('PDF Generation Error:', err);
    throw new Error(err.message || 'Failed to render PDF document');
  }
}

/**
 * Helper that wraps PDF generation in a Sonner toast notification.
 */
export async function exportElementToPdfWithToast(
  elementIdOrElement: string | HTMLElement,
  options: ExportPdfOptions
): Promise<void> {
  const element =
    typeof elementIdOrElement === 'string'
      ? document.getElementById(elementIdOrElement)
      : elementIdOrElement;

  if (!element) {
    toast.error('Document preview container could not be found.');
    return;
  }

  const promise = downloadElementAsPdf(element, options);

  toast.promise(promise, {
    loading: 'Generating high-resolution PDF document...',
    success: (filename) => `Downloaded ${filename}`,
    error: (err) => `PDF export failed: ${err.message || 'Please use browser Print instead'}`,
  });
}
