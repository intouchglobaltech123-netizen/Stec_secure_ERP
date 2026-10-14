import { Product } from './stecsecure-types';

/**
 * Auto-generates a unique sequential internal barcode in the format: STS-INT-XXXX
 * e.g. STS-INT-0001, STS-INT-0002...
 */
export const generateInternalBarcode = (existingProducts: Product[]): string => {
  let maxNum = 0;
  existingProducts.forEach((p) => {
    if (p.barcode) {
      const match = p.barcode.match(/^STS-INT-(\d+)$/i);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > maxNum) {
          maxNum = n;
        }
      }
    }
  });

  const nextNum = maxNum + 1;
  return `STS-INT-${String(nextNum).padStart(4, '0')}`;
};

/**
 * Safe clipboard copy with fallback
 */
export const copyBarcodeToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('Clipboard writeText failed, falling back', err);
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback clipboard copy failed', err);
    return false;
  }
};
