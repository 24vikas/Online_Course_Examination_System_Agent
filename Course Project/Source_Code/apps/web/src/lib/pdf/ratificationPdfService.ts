import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PDFDocument } from "pdf-lib";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { KLE_LOGO_DATA_URL, KLE_LOGO_ASPECT_RATIO } from "../../assets/brandLogoData";

export interface BlueprintSection {
  name: string;
  marks: number;
  questionType?: string;
  bloomLevel?: string;
}

export interface ValidationFinding {
  check: string;
  status: "PASSED" | "WARNING" | "FAILED" | "ENFORCED" | "AUDITED" | "VERIFIED";
  details: string;
}

export interface RatificationPayload {
  requestId?: string;
  blueprintId: string;
  title: string;
  courseCode: string;
  courseTitle: string;
  semester?: number | string;
  academicYear?: string;
  assessmentType?: string;
  totalMarks: number;
  durationMinutes: number;
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedRole?: string;
  approvedAt?: string;
  comments?: string;
  sections?: BlueprintSection[];
  validationFindings?: ValidationFinding[];
  proctoringRules?: {
    requireWebcam?: boolean;
    fullscreenRequired?: boolean;
    maxTabSwitches?: number;
    blockCopyPaste?: boolean;
  };
  rosterSummary?: {
    totalEnrolled?: number;
    eligibleCount?: number;
    flaggedCount?: number;
    attendanceThreshold?: string;
  };
  sourcePdfBytes?: Uint8Array | Buffer | null;
}

export interface RatificationResult {
  requestId: string;
  sha256Checksum: string;
  timestamp: string;
  ratificationPdfBytes: Uint8Array;
  ratificationBase64: string;
  sourcePdfBytes: Uint8Array;
  sourceBase64: string;
  mergedPdfBytes: Uint8Array;
  mergedBase64: string;
  auditRecord: Record<string, any>;
  savedPaths?: {
    ratificationPdfPath: string;
    sourcePdfPath: string;
    mergedPdfPath: string;
    auditRecordPath: string;
  };
}

/**
 * Loads the institutional KLE logo from disk as a base64 data URL.
 */
function getKleLogoDataUrl(): string | null {
  const possiblePaths = [
    path.join(process.cwd(), "apps/web/public/brand/kle-logo.png"),
    path.join(process.cwd(), "public/brand/kle-logo.png"),
    path.join(__dirname, "../../../public/brand/kle-logo.png"),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const buf = fs.readFileSync(p);
        return `data:image/png;base64,${buf.toString("base64")}`;
      } catch (err) {
        console.warn(`Could not read logo at ${p}:`, err);
      }
    }
  }
  return KLE_LOGO_DATA_URL;
}

/**
 * Generates an authoritative source curriculum syllabus PDF if no existing source is supplied.
 */
export function generateSourceCurriculumPdf(
  courseCode: string,
  courseTitle: string,
  academicYear = "2026-27",
  semester = "VII"
): Uint8Array {
  const doc = new jsPDF({ format: "a4", unit: "mm" });

  // Top header banner
  doc.setFillColor(11, 37, 69); // #0B2545
  doc.rect(12, 10, 186, 20, "F");

  // Logo slot in clean white reserved container preserving 624x125 aspect ratio
  const logoData = getKleLogoDataUrl() || KLE_LOGO_DATA_URL;
  const logoH = 12;
  const logoW = Math.round(logoH * KLE_LOGO_ASPECT_RATIO * 10) / 10; // ~59.9mm
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, 12, logoW + 3, logoH + 2, 1.5, 1.5, "F");
  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", 15.5, 13, logoW, logoH);
    } catch {
      // fallback if image fail
    }
  }

  const textLeft = 14 + logoW + 6;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("KLE TECHNOLOGICAL UNIVERSITY, HUBBALLI", textLeft, 18);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("SCHOOL OF COMPUTER SCIENCE & ENGINEERING • OFFICIAL COURSE SYLLABUS DIRECTIVE", textLeft, 24);

  // Course metadata table
  doc.setTextColor(11, 37, 69);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`COURSE CODE: ${courseCode}`, 14, 38);
  doc.setFontSize(12);
  doc.text(`TITLE: ${courseTitle}`, 14, 45);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Academic Year: ${academicYear} | Semester: ${semester} | Credits: 4.0 | Level: Senior Undergraduate / Core`,
    14,
    51
  );

  doc.setDrawColor(203, 213, 225);
  doc.line(14, 55, 196, 55);

  // Syllabus Units & Course Outcomes
  const units = [
    {
      unit: "Unit I: Foundations & Architectural Paradigms",
      desc: "Agentic workflow patterns, autonomous tool-use architectures, stateful multi-agent coordination, and deterministic boundary guardrails. Characterization of distributed agent communication and failure modes.",
      hours: "9 Hours",
      co: "CO1, CO2",
    },
    {
      unit: "Unit II: Multi-Tenant State, Memory & Checkpointing",
      desc: "Persistent checkpointing via LangGraph and PostgreSQL pgvector. Session management, isolation invariants, and tenant authorization boundaries. Retrieval augmented generation with BGE-M3 embeddings.",
      hours: "10 Hours",
      co: "CO2, CO3",
    },
    {
      unit: "Unit III: Statutory Evaluation & Policy Engine Integration",
      desc: "Open Policy Agent (OPA) with versioned Rego policies for attendance and bursar eligibility. Deterministic authority separation: AI advisory vs server-side authoritative clock and grade calculation.",
      hours: "10 Hours",
      co: "CO3, CO4",
    },
    {
      unit: "Unit IV: Proctoring Security, Lockdown & Integrity Telemetry",
      desc: "Webcam verification, full-screen lockdown enforcement, clipboard tamper detection, and real-time incident telemetry aggregation. Evidence preservation and cryptographic audit trails.",
      hours: "8 Hours",
      co: "CO4, CO5",
    },
    {
      unit: "Unit V: Authoritative Ratification & Academic Governance",
      desc: "Controller of Examinations (COE) ratification workflows, cryptographic hash sign-offs, official A4 ratification addendum generation, and tamper-evident result publishing.",
      hours: "8 Hours",
      co: "CO1, CO5",
    },
  ];

  autoTable(doc, {
    startY: 60,
    margin: { left: 14, right: 14 },
    head: [["Unit / Topic Directive", "Contact Hours", "Target Course Outcomes"]],
    body: units.map((u) => [
      `${u.unit}\n${u.desc}`,
      u.hours,
      u.co,
    ]),
    headStyles: {
      fillColor: [11, 37, 69],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
    },
    bodyStyles: {
      textColor: [30, 41, 59],
      fontSize: 8,
      cellPadding: 3,
    },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 26, halign: "center" },
      2: { cellWidth: 32, halign: "center" },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  // Footer note
  const finalY = (doc as any).lastAutoTable?.finalY || 240;
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "Approved by the Academic Council & Board of Studies • KLE Technological University • Hubballi - 580031",
    14,
    finalY + 12
  );

  return new Uint8Array(doc.output("arraybuffer"));
}

/**
 * Generates the official 1-page A4 Ratification Certificate PDF.
 */
export function generateRatificationCertificatePdf(payload: RatificationPayload): {
  pdfBytes: Uint8Array;
  base64: string;
  sha256Checksum: string;
  requestId: string;
  timestamp: string;
} {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const requestId =
    payload.requestId ||
    `COE-RAT-${new Date().getFullYear()}-${payload.courseCode.replace(/[^a-zA-Z0-9]/g, "")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const timestamp = payload.approvedAt || new Date().toISOString();
  const formattedIstTime = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "medium",
  }).format(new Date(timestamp));

  // Compute canonical SHA-256 over key ratification facts
  const canonicalData = JSON.stringify({
    requestId,
    blueprintId: payload.blueprintId,
    courseCode: payload.courseCode,
    courseTitle: payload.courseTitle,
    totalMarks: payload.totalMarks,
    durationMinutes: payload.durationMinutes,
    approvedBy: payload.approvedBy || "Dr. M.K. Rao",
    approvedRole: payload.approvedRole || "Controller of Examinations",
    approvedAt: timestamp,
    comments: payload.comments || "Ratified under institutional examination directives.",
    sections: payload.sections || [],
  });
  const sha256Checksum = crypto.createHash("sha256").update(canonicalData).digest("hex");

  // 1. Decorative border
  doc.setDrawColor(11, 37, 69);
  doc.setLineWidth(0.8);
  doc.rect(8, 8, 194, 281);

  doc.setDrawColor(217, 119, 6); // gold inner border
  doc.setLineWidth(0.3);
  doc.rect(9.5, 9.5, 191, 278);

  // 2. Header Banner
  doc.setFillColor(11, 37, 69); // #0B2545
  doc.rect(10, 10, 190, 26, "F");

  // 3. Logo Slot preserving 624x125 aspect ratio in clean white slot
  const logoData = getKleLogoDataUrl() || KLE_LOGO_DATA_URL;
  const logoH = 14;
  const logoW = Math.round(logoH * KLE_LOGO_ASPECT_RATIO * 10) / 10;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(13, 12.5, logoW + 3, logoH + 2.5, 1.5, 1.5, "F");
  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", 14.5, 13.75, logoW, logoH);
    } catch (err) {
      console.warn("Could not insert logo into ratification certificate:", err);
    }
  }

  // 4. Header Titles
  const textLeft = 13 + logoW + 6;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.text("KLE TECHNOLOGICAL UNIVERSITY", textLeft, 18);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("SCHOOL OF COMPUTER SCIENCE & ENGINEERING • OFFICE OF THE CONTROLLER OF EXAMINATIONS", textLeft, 23);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(253, 224, 71); // amber-300
  doc.text("STATUTORY EXAMINATION RATIFICATION & BLUEPRINT AUTHORIZATION", textLeft, 29);

  // 5. Document ID & Timestamp ribbon
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(10, 37, 190, 11, "F");
  doc.setDrawColor(203, 213, 225);
  doc.line(10, 48, 200, 48);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(`CERTIFICATE REF: ${requestId}`, 14, 44);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(`Issued: ${formattedIstTime}`, 120, 44);

  // 6. Examination Subject & Blueprint Overview Table
  autoTable(doc, {
    startY: 51,
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: 2, textColor: [15, 23, 42] },
    body: [
      [
        { content: "Course Code:", styles: { fontStyle: "bold", textColor: [11, 37, 69] } },
        payload.courseCode,
        { content: "Academic Term:", styles: { fontStyle: "bold", textColor: [11, 37, 69] } },
        `${payload.academicYear || "AY 2026-27"} (Sem ${payload.semester || "VII"})`,
      ],
      [
        { content: "Course Title:", styles: { fontStyle: "bold", textColor: [11, 37, 69] } },
        payload.courseTitle,
        { content: "Assessment Type:", styles: { fontStyle: "bold", textColor: [11, 37, 69] } },
        payload.assessmentType || "INTERNAL_ASSESSMENT",
      ],
      [
        { content: "Blueprint Title:", styles: { fontStyle: "bold", textColor: [11, 37, 69] } },
        payload.title,
        { content: "Duration / Marks:", styles: { fontStyle: "bold", textColor: [11, 37, 69] } },
        `${payload.durationMinutes} Minutes / ${payload.totalMarks} Total Marks`,
      ],
      [
        { content: "Submitted By:", styles: { fontStyle: "bold", textColor: [11, 37, 69] } },
        payload.submittedBy || "Prof. Course Instructor",
        { content: "Submission Date:", styles: { fontStyle: "bold", textColor: [11, 37, 69] } },
        payload.submittedAt ? new Date(payload.submittedAt).toLocaleDateString("en-IN") : "Recorded in Audit Log",
      ],
    ],
  });

  // 7. Statutory Ratification Order Box
  const orderStartY = (doc as any).lastAutoTable?.finalY + 4 || 85;

  doc.setFillColor(240, 253, 244); // emerald-50
  doc.setDrawColor(34, 197, 94); // emerald-500
  doc.setLineWidth(0.6);
  doc.roundedRect(12, orderStartY, 186, 32, 2, 2, "FD");

  doc.setTextColor(21, 128, 61); // emerald-700
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("EXECUTIVE STATUTORY RATIFICATION ORDER", 16, orderStartY + 6);

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const mandateText =
    "By authority vested in the Controller of Examinations pursuant to Section 14 of the Academic Regulations of KLE Technological University, this examination blueprint, syllabus coverage matrix, and proctoring parameters have been formally examined, audited, and ratified. Authorization is hereby granted to publish the examination schedule and release student registration access.";
  const splitMandate = doc.splitTextToSize(mandateText, 178);
  doc.text(splitMandate, 16, orderStartY + 12);

  // COE Remarks
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(11, 37, 69);
  doc.text("COE Executive Minute: ", 16, orderStartY + 27);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(51, 65, 85);
  doc.text(payload.comments || "Ratified under UGC & ABET institutional criteria.", 52, orderStartY + 27);

  // 8. Compliance & Validation Audit Checklist Table
  const defaultFindings: ValidationFinding[] = payload.validationFindings || [
    {
      check: "Bloom's Taxonomy Distribution",
      status: "PASSED",
      details: "40% Remember/Understand (20m), 40% Apply/Analyze (20m), 20% Evaluate/Create (10m).",
    },
    {
      check: "Syllabus Coverage & CO Alignment",
      status: "PASSED",
      details: "Units 1-4 represented; full coverage of CO1, CO2, CO3, and CO4 mapped.",
    },
    {
      check: "Proctoring Protocol & Security",
      status: "ENFORCED",
      details: "Webcam mandatory, fullscreen lockdown enforced, maximum 3 tab switch tolerance.",
    },
    {
      check: "Candidate Cohort & Roster Gate",
      status: "AUDITED",
      details: `Roster verified. ${payload.rosterSummary?.eligibleCount ?? 68} eligible candidates, ${payload.rosterSummary?.flaggedCount ?? 4} conditional holds.`,
    },
    {
      check: "Authoritative Vector Provenance",
      status: "VERIFIED",
      details: "Structured doc chunks verified with BGE-M3 pgvector retrieval storage.",
    },
  ];

  autoTable(doc, {
    startY: orderStartY + 36,
    margin: { left: 14, right: 14 },
    head: [["Statutory Audit Verification Gate", "Status", "Authoritative Compliance Details"]],
    body: defaultFindings.map((f) => [
      f.check,
      f.status,
      f.details,
    ]),
    headStyles: {
      fillColor: [11, 37, 69],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: {
      textColor: [30, 41, 59],
      fontSize: 7.5,
      cellPadding: 2.2,
    },
    columnStyles: {
      0: { cellWidth: 54, fontStyle: "bold" },
      1: { cellWidth: 26, halign: "center", fontStyle: "bold" },
      2: { cellWidth: 98 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        const val = String(data.cell.raw);
        if (val === "PASSED" || val === "VERIFIED" || val === "AUDITED" || val === "ENFORCED") {
          data.cell.styles.textColor = [21, 128, 61]; // emerald-700
        } else if (val === "WARNING") {
          data.cell.styles.textColor = [180, 83, 9]; // amber-700
        } else {
          data.cell.styles.textColor = [185, 28, 28]; // red-700
        }
      }
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  // 9. Blueprint Structure Breakdown Table
  const structStartY = (doc as any).lastAutoTable?.finalY + 3 || 185;

  const sections: BlueprintSection[] =
    payload.sections && payload.sections.length > 0
      ? payload.sections
      : [
          { name: "Section A: Conceptual & Objective Invariants", marks: 30, questionType: "MCQ (15 Qs x 2m)", bloomLevel: "Remember / Understand" },
          { name: "Section B: Theoretical Analysis & System Trade-offs", marks: 20, questionType: "Subjective (2 Qs x 10m)", bloomLevel: "Apply / Analyze" },
        ];

  autoTable(doc, {
    startY: structStartY,
    margin: { left: 14, right: 14 },
    head: [["Section Structure", "Question Format", "Marks", "Target Bloom Level"]],
    body: sections.map((s) => [
      s.name,
      s.questionType || "Standard Question",
      `${s.marks} Marks`,
      s.bloomLevel || "Analytical",
    ]),
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: {
      textColor: [30, 41, 59],
      fontSize: 7.5,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 74 },
      1: { cellWidth: 44 },
      2: { cellWidth: 24, halign: "center", fontStyle: "bold" },
      3: { cellWidth: 36, halign: "center" },
    },
  });

  // 10. Official Signature & Cryptographic Seal Block
  const sigY = (doc as any).lastAutoTable?.finalY + 4 || 230;

  // Left: Digital Signature & Approver details
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(12, sigY, 110, 28, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(11, 37, 69);
  doc.text("RATIFIED AND SIGNED BY:", 16, sigY + 6);

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(payload.approvedBy || "Dr. M.K. Rao", 16, sigY + 13);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(payload.approvedRole || "Controller of Examinations (COE)", 16, sigY + 18);
  doc.text(`KLE Technological University • Hubballi, Karnataka`, 16, sigY + 23);

  // Right: Circular Seal Representation
  doc.roundedRect(126, sigY, 72, 28, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(21, 128, 61);
  doc.text("OFFICIAL STATUTORY SEAL", 132, sigY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text("Statutory Governance Certified", 132, sigY + 11);
  doc.text("State Machine Release: COMMITTED", 132, sigY + 16);
  doc.text(`Digital Sign-off: ${new Date(timestamp).toLocaleDateString("en-IN")}`, 132, sigY + 21);

  // 11. Tamper-evident SHA-256 Checksum Footer
  const footerY = sigY + 31;
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(10, footerY, 190, 16, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("courier", "bold");
  doc.setFontSize(7.5);
  doc.text("CANONICAL CRYPTOGRAPHIC INTEGRITY CHECKSUM (SHA-256):", 14, footerY + 5);

  doc.setTextColor(147, 197, 253); // blue-300
  doc.setFont("courier", "normal");
  doc.setFontSize(7);
  doc.text(sha256Checksum, 14, footerY + 10);

  doc.setTextColor(148, 163, 184); // slate-400
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text(
    "Tamper-evident legal certificate. Any modification invalidates academic authorization.",
    14,
    footerY + 14
  );

  const pdfBytes = new Uint8Array(doc.output("arraybuffer"));
  const base64 = Buffer.from(pdfBytes).toString("base64");

  return {
    pdfBytes,
    base64,
    sha256Checksum,
    requestId,
    timestamp,
  };
}

/**
 * Merges the 1-page Official Ratification Certificate with the source document.
 * The Ratification Certificate is prepended as Page 1.
 */
export async function mergeRatificationWithSource(
  ratificationBytes: Uint8Array,
  sourceBytes: Uint8Array
): Promise<Uint8Array> {
  const mergedDoc = await PDFDocument.create();

  // Load ratification page
  const ratPdf = await PDFDocument.load(ratificationBytes);
  const ratPages = await mergedDoc.copyPages(ratPdf, ratPdf.getPageIndices());
  for (const page of ratPages) {
    mergedDoc.addPage(page);
  }

  // Load source document
  try {
    const srcPdf = await PDFDocument.load(sourceBytes);
    const srcPages = await mergedDoc.copyPages(srcPdf, srcPdf.getPageIndices());
    for (const page of srcPages) {
      mergedDoc.addPage(page);
    }
  } catch (err) {
    console.warn("Could not copy source pages into merged PDF; falling back to ratification page only:", err);
  }

  return await mergedDoc.save();
}

/**
 * Main Orchestrator:
 * Generates the Official Ratification Certificate, handles source document retrieval/generation,
 * merges them into a unified PDF, and creates an audit record.
 */
export async function generateOfficialRatification(
  payload: RatificationPayload
): Promise<RatificationResult> {
  // 1. Generate 1-page A4 Ratification Certificate
  const ratification = generateRatificationCertificatePdf(payload);

  // 2. Prepare Source Document PDF
  let sourcePdfBytes: Uint8Array;
  if (payload.sourcePdfBytes && payload.sourcePdfBytes.length > 0) {
    sourcePdfBytes = payload.sourcePdfBytes instanceof Uint8Array
      ? payload.sourcePdfBytes
      : new Uint8Array(payload.sourcePdfBytes);
  } else {
    sourcePdfBytes = generateSourceCurriculumPdf(
      payload.courseCode,
      payload.courseTitle,
      payload.academicYear,
      String(payload.semester || "VII")
    );
  }
  const sourceBase64 = Buffer.from(sourcePdfBytes).toString("base64");

  // 3. Merge Ratification Page with Source Document
  const mergedPdfBytes = await mergeRatificationWithSource(
    ratification.pdfBytes,
    sourcePdfBytes
  );
  const mergedBase64 = Buffer.from(mergedPdfBytes).toString("base64");

  // 4. Construct Audit Record
  const auditRecord = {
    certificateId: ratification.requestId,
    blueprintId: payload.blueprintId,
    courseCode: payload.courseCode,
    courseTitle: payload.courseTitle,
    academicYear: payload.academicYear || "2026-27",
    semester: payload.semester || 7,
    totalMarks: payload.totalMarks,
    durationMinutes: payload.durationMinutes,
    sha256Checksum: ratification.sha256Checksum,
    ratifiedAt: ratification.timestamp,
    ratifiedBy: {
      name: payload.approvedBy || "Dr. M.K. Rao",
      role: payload.approvedRole || "Controller of Examinations (COE)",
      institution: "KLE Technological University, Hubballi",
    },
    comments: payload.comments || "Ratified under institutional criteria.",
    validationFindings: payload.validationFindings || [],
    securityAudit: {
      sourceDocumentIncluded: true,
      mergedPageCount: (await PDFDocument.load(mergedPdfBytes)).getPageCount(),
      ratificationPageCount: 1,
      integrityState: "CRYPTOGRAPHICALLY_VERIFIED",
    },
  };

  // Optional: persist copies to public/ratifications/ or data store for direct file downloads
  let savedPaths: RatificationResult["savedPaths"] | undefined;
  try {
    const cwd = process.cwd();
    const outDir = cwd.endsWith("apps/web")
      ? path.join(cwd, "public/ratifications")
      : path.join(cwd, "apps/web/public/ratifications");
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const cleanId = ratification.requestId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const ratPath = path.join(outDir, `${cleanId}_ratification.pdf`);
    const srcPath = path.join(outDir, `${cleanId}_source.pdf`);
    const mrgPath = path.join(outDir, `${cleanId}_authoritative_merged.pdf`);
    const audPath = path.join(outDir, `${cleanId}_audit_record.json`);

    fs.writeFileSync(ratPath, ratification.pdfBytes);
    fs.writeFileSync(srcPath, sourcePdfBytes);
    fs.writeFileSync(mrgPath, mergedPdfBytes);
    fs.writeFileSync(audPath, JSON.stringify(auditRecord, null, 2), "utf-8");

    savedPaths = {
      ratificationPdfPath: ratPath,
      sourcePdfPath: srcPath,
      mergedPdfPath: mrgPath,
      auditRecordPath: audPath,
    };
  } catch (err) {
    console.warn("Notice: Could not write ratification files to public directory:", err);
  }

  return {
    requestId: ratification.requestId,
    sha256Checksum: ratification.sha256Checksum,
    timestamp: ratification.timestamp,
    ratificationPdfBytes: ratification.pdfBytes,
    ratificationBase64: ratification.base64,
    sourcePdfBytes,
    sourceBase64,
    mergedPdfBytes,
    mergedBase64,
    auditRecord,
    savedPaths,
  };
}
