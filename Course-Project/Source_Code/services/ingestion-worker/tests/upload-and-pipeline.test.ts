import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import {
  validateUploadFile,
  SUPPORTED_EXTENSIONS_MAP,
  runIngestionPipeline,
  checkSyllabusPdfStaging,
  MockDoclingClient,
  TestDeterministicEmbeddingProvider,
} from "../src/index.ts";

test("Task 1: File Validator - Validates PDF, DOCX, XLSX/CSV, PPTX, TXT/MD/HTML, JSON with MIME and size limits", async (t) => {
  await t.test("Accepts valid PDF with %PDF- header", () => {
    const pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
    const res = validateUploadFile(pdfBuffer, "syllabus.pdf", "application/pdf");
    assert.equal(res.valid, true);
    assert.equal(res.detectedFormat, "PDF");
    assert.equal(res.mimeType, "application/pdf");
    assert.equal(res.fileSizeBytes, pdfBuffer.length);
    assert.equal(res.sha256Hash.length, 64);
  });

  await t.test("Rejects corrupt PDF without %PDF- magic bytes", () => {
    const corruptBuffer = Buffer.from("NOT_A_REAL_PDF_FILE_HEADER");
    const res = validateUploadFile(corruptBuffer, "fake.pdf", "application/pdf");
    assert.equal(res.valid, false);
    assert.equal(res.detectedFormat, "INVALID_PDF");
    assert.match(res.error || "", /CORRUPTED_PDF/);
  });

  await t.test("Accepts valid DOCX with PK container header", () => {
    const docxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x00, 0x00]);
    const res = validateUploadFile(docxBuffer, "lesson_plan.docx");
    assert.equal(res.valid, true);
    assert.equal(res.detectedFormat, "DOCX");
  });

  await t.test("Accepts valid PPTX and XLSX with PK container header", () => {
    const pkBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
    const pptxRes = validateUploadFile(pkBuffer, "slides.pptx");
    assert.equal(pptxRes.valid, true);
    assert.equal(pptxRes.detectedFormat, "PPTX");

    const xlsxRes = validateUploadFile(pkBuffer, "grades.xlsx");
    assert.equal(xlsxRes.valid, true);
    assert.equal(xlsxRes.detectedFormat, "XLSX");
  });

  await t.test("Accepts valid CSV, TXT, MD, HTML", () => {
    const csvRes = validateUploadFile(Buffer.from("a,b,c\n1,2,3"), "data.csv");
    assert.equal(csvRes.valid, true);
    assert.equal(csvRes.detectedFormat, "CSV");

    const txtRes = validateUploadFile(Buffer.from("Hello text syllabus"), "syllabus.txt");
    assert.equal(txtRes.valid, true);
    assert.equal(txtRes.detectedFormat, "TXT");

    const mdRes = validateUploadFile(Buffer.from("# Syllabus\n\n## Unit 1"), "syllabus.md");
    assert.equal(mdRes.valid, true);
    assert.equal(mdRes.detectedFormat, "MD");

    const htmlRes = validateUploadFile(Buffer.from("<h1>Curriculum</h1>"), "index.html");
    assert.equal(htmlRes.valid, true);
    assert.equal(htmlRes.detectedFormat, "HTML");
  });

  await t.test("Accepts valid JSON and rejects malformed JSON", () => {
    const validJson = Buffer.from(JSON.stringify({ course: "26ECAC401", credits: 4 }));
    const validRes = validateUploadFile(validJson, "course.json");
    assert.equal(validRes.valid, true);
    assert.equal(validRes.detectedFormat, "JSON");

    const invalidJson = Buffer.from("{ course: 26ECAC401, unquoted }");
    const invalidRes = validateUploadFile(invalidJson, "broken.json");
    assert.equal(invalidRes.valid, false);
    assert.match(invalidRes.error || "", /MALFORMED_JSON/);
  });

  await t.test("Rejects empty 0-byte file and oversized file", () => {
    const emptyRes = validateUploadFile(Buffer.alloc(0), "empty.pdf");
    assert.equal(emptyRes.valid, false);
    assert.match(emptyRes.error || "", /FILE_TOO_SMALL/);

    const overRes = validateUploadFile(Buffer.alloc(100), "huge.pdf", "application/pdf", { maxSizeBytes: 50 });
    assert.equal(overRes.valid, false);
    assert.match(overRes.error || "", /FILE_TOO_LARGE/);
  });

  await t.test("Rejects unsupported executable / binary extension", () => {
    const exeRes = validateUploadFile(Buffer.from("MZ4938204"), "malware.exe");
    assert.equal(exeRes.valid, false);
    assert.match(exeRes.error || "", /UNSUPPORTED_EXTENSION/);
  });
});

test("Task 2: Ingestion Pipeline - UPLOAD -> VALIDATE -> EXTRACT -> CHUNK -> EMBED -> READY", async () => {
  const mockDocling = new MockDoclingClient();
  const mockEmbedding = new TestDeterministicEmbeddingProvider();

  const pdfBuffer = Buffer.from("%PDF-1.4\nAcademic Syllabus Stream Content\n%%EOF");
  const result = await runIngestionPipeline({
    tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    courseOfferingId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    syllabusVersionId: "55555555-5555-5555-5555-555555555555",
    filename: "Syllabus_Directive.pdf",
    fileBuffer: pdfBuffer,
    doclingClient: mockDocling,
    embeddingProvider: mockEmbedding,
  });

  assert.equal(result.success, true);
  assert.equal(result.status, "READY");
  assert.equal(result.filename, "Syllabus_Directive.pdf");
  assert.equal(result.embeddingModel, mockEmbedding.getMetadata().model);
  assert.equal(result.embeddingDimension, 1024);
  assert.ok(result.chunkCount > 0, "Chunk count should be > 0");
  assert.ok(result.chunks[0].citationLocator.includes("Syllabus_Directive.pdf"), "Citation locator present");
  assert.ok(result.timings.totalMs >= 0);
  assert.ok(result.timings.validationMs >= 0);
});

test("Task 5: Staging Syllabus Check - Detects missing PDF and marks BLOCKED with exact required path", () => {
  const result = checkSyllabusPdfStaging("26ECAC401");
  assert.equal(result.activeCourseCode, "26ECAC401");

  // Since Agentic_AI_Lesson_Plan_26ECAC401_Final.pdf is not present on disk, status must be BLOCKED
  if (!result.found) {
    assert.equal(result.status, "BLOCKED");
    assert.ok(result.missingFile?.includes("Agentic_AI_Lesson_Plan_26ECAC401_Final.pdf"));
    assert.ok(result.reason?.includes("absent on disk"));
    assert.ok(result.availableStagedPdfs.length > 0, "Should list available staged PDFs in data store");
  } else {
    assert.equal(result.status, "READY");
  }
});
