/**
 * Institutional PDF Header and Brand Integration Helper
 *
 * Provides authoritative KLE Technological University headers with
 * authentic logo embedding, aspect ratio preservation, and graceful fallback slots.
 */

import type { jsPDF } from 'jspdf';
import {
  KLE_LOGO_DATA_URL,
  KLE_LOGO_BASE64,
  KLE_LOGO_ASPECT_RATIO,
  KLE_LOGO_WIDTH,
  KLE_LOGO_HEIGHT,
} from '../../assets/brandLogoData';

export {
  KLE_LOGO_DATA_URL,
  KLE_LOGO_BASE64,
  KLE_LOGO_ASPECT_RATIO,
  KLE_LOGO_WIDTH,
  KLE_LOGO_HEIGHT,
};

export interface InstitutionalPdfHeaderOptions {
  /** Document / Council Title */
  title?: string;
  /** Department or Subtitle */
  subtitle?: string;
  /** Right-hand top line (e.g. Doc Ref, Exam Code, Course Code) */
  rightTop?: string;
  /** Right-hand bottom line (e.g. Date, Checksum, Status) */
  rightBottom?: string;
  /** Total header banner height in mm (default: 28mm) */
  bannerHeight?: number;
  /** RGB Accent line color (default: [31, 77, 63] deep green) */
  accentColor?: [number, number, number];
}

/**
 * Draws the authentic KLE Tech institutional header on any jsPDF document.
 */
export function drawInstitutionalPdfHeader(
  doc: jsPDF,
  options: InstitutionalPdfHeaderOptions = {}
): { bannerBottomY: number; contentStartY: number } {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const bannerHeight = options.bannerHeight ?? 28;
  const accent = options.accentColor ?? [31, 77, 63]; // KLE Deep Green

  // 1. Dark Institutional Banner
  doc.setFillColor(15, 23, 42); // Slate-900
  doc.rect(0, 0, pageWidth, bannerHeight, 'F');

  // 2. KLE Brand Accent Line
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, bannerHeight, pageWidth, 2, 'F');

  // 3. Official Logo in Reserved Clean White Slot
  const logoH = 13;
  const logoW = Math.round(logoH * KLE_LOGO_ASPECT_RATIO * 10) / 10; // ~64.9mm
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, 4.5, logoW + 4, logoH + 2.5, 1.5, 1.5, 'F');

  try {
    doc.addImage(KLE_LOGO_DATA_URL, 'PNG', margin + 2, 5.75, logoW, logoH);
  } catch (err) {
    // Resilient fallback slot if image rendering is blocked
    doc.setFillColor(31, 77, 63);
    doc.roundedRect(margin + 2, 5.75, 18, logoH, 1, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('KLE', margin + 4, 14);
  }

  // 4. Institutional Titles
  const textX = margin + logoW + 8;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(
    options.title || 'KLE TECHNOLOGICAL UNIVERSITY',
    textX,
    11
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225); // Slate-300
  doc.text(
    options.subtitle || 'OFFICE OF THE CONTROLLER OF EXAMINATIONS • ACADEMIC EVALUATION',
    textX,
    17
  );

  // 5. Right-Hand References
  if (options.rightTop) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(214, 235, 221); // Mint tint
    doc.text(options.rightTop, pageWidth - margin, 11, { align: 'right' });
  }
  if (options.rightBottom) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(options.rightBottom, pageWidth - margin, 17, { align: 'right' });
  }

  return {
    bannerBottomY: bannerHeight + 2,
    contentStartY: bannerHeight + 10,
  };
}

export default drawInstitutionalPdfHeader;
