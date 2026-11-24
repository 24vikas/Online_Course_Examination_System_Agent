import crypto from "crypto";
import type { DocumentChunkItem } from "@exam-system/contracts";
import type { DoclingConversionResult, DoclingElement } from "./docling-client.ts";

export interface ChunkingOptions {
  maxChunkChars?: number;
  overlapChars?: number;
  strategyVersion?: string;
}

export class DocumentChunker {
  private maxChars: number;
  private overlapChars: number;
  private strategyVersion: string;

  constructor(options?: ChunkingOptions) {
    this.maxChars = options?.maxChunkChars || 800;
    this.overlapChars = options?.overlapChars || 100;
    this.strategyVersion = options?.strategyVersion || "v1-heading-aware";
  }

  /**
   * Deterministically splits parsed Docling elements into provenance-preserving chunks.
   * Headings and table structures are maintained with page start and page end references.
   */
  chunkDocument(
    tenantId: string,
    courseOfferingId: string,
    syllabusVersionId: string,
    conversion: DoclingConversionResult
  ): DocumentChunkItem[] {
    const chunks: DocumentChunkItem[] = [];
    let currentSection = "General Overview";
    let chunkIndex = 0;

    let buffer = "";
    let bufferStartPage = 1;
    let bufferEndPage = 1;
    let bufferType = "paragraph";

    const flushBuffer = () => {
      if (buffer.trim().length === 0) return;

      const content = buffer.trim();
      const contentHash = crypto.createHash("sha256").update(content).digest("hex");
      const chunkId = crypto.randomUUID();

      chunks.push({
        id: chunkId,
        tenantId,
        courseOfferingId,
        syllabusVersionId,
        documentId: conversion.documentId,
        chunkIndex,
        content,
        contentHash,
        pageStart: bufferStartPage,
        pageEnd: bufferEndPage,
        sectionHeader: currentSection,
        elementType: bufferType,
        embeddingStatus: "PENDING",
        createdAt: new Date().toISOString(),
      });

      chunkIndex++;
      buffer = "";
    };

    for (const el of conversion.elements) {
      if (el.type === "heading") {
        flushBuffer();
        currentSection = el.text;
        bufferStartPage = el.page;
        bufferEndPage = el.page;
        bufferType = "heading";
        buffer = el.text;
        flushBuffer();
        continue;
      }

      if (el.type === "table") {
        flushBuffer();
        bufferStartPage = el.page;
        bufferEndPage = el.page;
        bufferType = "table";

        let tableStr = `[Table on Page ${el.page}: ${el.text}]\n`;
        if (el.tableData && el.tableData.length > 0) {
          tableStr += el.tableData.map((row) => row.join(" | ")).join("\n");
        }
        buffer = tableStr;
        flushBuffer();
        continue;
      }

      // Standard paragraph element
      if (buffer.length === 0) {
        bufferStartPage = el.page;
        bufferEndPage = el.page;
        bufferType = el.type;
      } else {
        bufferEndPage = Math.max(bufferEndPage, el.page);
      }

      if (buffer.length + el.text.length > this.maxChars && buffer.length > 0) {
        flushBuffer();
        bufferStartPage = el.page;
        bufferEndPage = el.page;
        bufferType = el.type;
      }

      buffer += (buffer.length > 0 ? "\n\n" : "") + el.text;
    }

    flushBuffer();
    return chunks;
  }
}
