export interface DoclingElement {
  type: "paragraph" | "heading" | "table" | "list" | "code";
  text: string;
  page: number;
  headingLevel?: number;
  tableData?: Array<Array<string>>;
}

export interface DoclingConversionResult {
  documentId: string;
  markdown: string;
  elements: DoclingElement[];
  totalPages: number;
  doclingVersion: string;
}

export interface DoclingClient {
  convertDocument(
    documentId: string,
    fileBytes: Buffer,
    filename: string
  ): Promise<DoclingConversionResult>;
  health(): Promise<{ status: string; version: string }>;
}

export class HttpDoclingClient implements DoclingClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl: string = "http://localhost:5001", timeoutMs: number = 180000) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  async health(): Promise<{ status: string; version: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`DOCLING_UNHEALTHY: HTTP ${response.status}`);
      }
      return { status: "healthy", version: "v1.18.0" };
    } finally {
      clearTimeout(timeout);
    }
  }

  async convertDocument(
    documentId: string,
    fileBytes: Buffer,
    filename: string
  ): Promise<DoclingConversionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    // Direct fast-path for plain text and JSON documents that do not require neural OCR/layout parsing
    const ext = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
    if (ext === ".txt") {
      const text = fileBytes.toString("utf-8");
      const lines = text.split("\n");
      const elements: DoclingElement[] = [];
      let buf = "";
      for (const line of lines) {
        if (!line.trim()) {
          if (buf.trim()) {
            elements.push({ type: "paragraph", text: buf.trim(), page: 1 });
            buf = "";
          }
        } else {
          buf += (buf ? " " : "") + line.trim();
        }
      }
      if (buf.trim()) {
        elements.push({ type: "paragraph", text: buf.trim(), page: 1 });
      }
      return {
        documentId,
        markdown: text,
        elements: elements.length > 0 ? elements : [{ type: "paragraph", text, page: 1 }],
        totalPages: 1,
        doclingVersion: "direct-text-extractor",
      };
    }

    if (ext === ".json") {
      const rawText = fileBytes.toString("utf-8");
      let jsonObj: any;
      try {
        jsonObj = JSON.parse(rawText);
      } catch {
        jsonObj = { raw: rawText };
      }
      const formattedMd = "```json\n" + JSON.stringify(jsonObj, null, 2) + "\n```";
      const elements: DoclingElement[] = [];

      if (Array.isArray(jsonObj)) {
        jsonObj.forEach((item, idx) => {
          elements.push({
            type: "paragraph",
            text: `Item ${idx + 1}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}`,
            page: 1,
          });
        });
      } else if (typeof jsonObj === "object" && jsonObj !== null) {
        for (const [k, v] of Object.entries(jsonObj)) {
          elements.push({
            type: "heading",
            headingLevel: 2,
            text: String(k),
            page: 1,
          });
          elements.push({
            type: "paragraph",
            text: typeof v === "object" ? JSON.stringify(v, null, 2) : String(v),
            page: 1,
          });
        }
      } else {
        elements.push({ type: "paragraph", text: String(jsonObj), page: 1 });
      }

      return {
        documentId,
        markdown: formattedMd,
        elements,
        totalPages: 1,
        doclingVersion: "direct-json-extractor",
      };
    }

    try {
      const base64Str = fileBytes.toString("base64");
      const endpoint = `${this.baseUrl}/v1alpha/convert/source`;
      const payload = {
        file_sources: [
          {
            filename,
            base64_string: base64Str,
          },
        ],
        options: {
          to_formats: ["md", "json"],
          do_ocr: false,
        },
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 400 || response.status === 415) {
          throw new Error(`DOCLING_TERMINAL_ERROR: Unprocessable document (HTTP ${response.status})`);
        }
        throw new Error(`DOCLING_SERVER_ERROR: Conversion failed with HTTP ${response.status}`);
      }

      const data = (await response.json()) as any;
      const markdown = data.document?.md_content || data.document?.markdown || data.markdown || "";
      const j = data.document?.json_content;

      let elements: DoclingElement[] = [];
      let totalPages = 1;

      // 1. If explicit elements array is present (e.g. from mock or forward compat)
      if (Array.isArray(data.document?.elements) && data.document.elements.length > 0) {
        elements = data.document.elements.map((el: any) => ({
          type: el.type || "paragraph",
          text: el.text || "",
          page: el.page || 1,
          headingLevel: el.level,
        }));
        totalPages = data.document.total_pages || 1;
      } else if (j && (Array.isArray(j.texts) || Array.isArray(j.tables))) {
        // 2. Extract from Docling json_content texts and tables
        if (j.pages && typeof j.pages === "object") {
          totalPages = Math.max(totalPages, Object.keys(j.pages).length);
        }

        for (const t of j.texts || []) {
          if (!t.text || !t.text.trim()) continue;
          const isHeading = ["section_header", "title", "page_header", "header"].includes(t.label);
          const page = t.prov?.[0]?.page_no || 1;
          if (page > totalPages) totalPages = page;
          elements.push({
            type: isHeading ? "heading" : "paragraph",
            text: t.text.trim(),
            page,
            headingLevel: isHeading ? 2 : undefined,
          });
        }

        for (const tbl of j.tables || []) {
          const page = tbl.prov?.[0]?.page_no || 1;
          if (page > totalPages) totalPages = page;
          const grid = tbl.data?.grid || [];
          const tableData = grid.map((row: any[]) => row.map((cell: any) => cell.text || ""));
          elements.push({
            type: "table",
            text: `Table (${grid.length} rows)`,
            page,
            tableData,
          });
        }
      }

      // 3. Fallback: Parse markdown lines if elements array is still empty
      if (elements.length === 0 && markdown) {
        const lines = markdown.split("\n");
        let currentParagraph = "";
        for (const line of lines) {
          if (line.startsWith("#")) {
            if (currentParagraph.trim()) {
              elements.push({ type: "paragraph", text: currentParagraph.trim(), page: 1 });
              currentParagraph = "";
            }
            elements.push({ type: "heading", text: line.replace(/^#+\s*/, "").trim(), page: 1, headingLevel: 1 });
          } else if (line.trim().length === 0) {
            if (currentParagraph.trim()) {
              elements.push({ type: "paragraph", text: currentParagraph.trim(), page: 1 });
              currentParagraph = "";
            }
          } else {
            currentParagraph += (currentParagraph ? " " : "") + line.trim();
          }
        }
        if (currentParagraph.trim()) {
          elements.push({ type: "paragraph", text: currentParagraph.trim(), page: 1 });
        }
      }

      // Ensure at least one element exists if markdown has text
      if (elements.length === 0 && markdown.trim()) {
        elements.push({ type: "paragraph", text: markdown.trim(), page: 1 });
      }

      return {
        documentId,
        markdown,
        elements,
        totalPages: Math.max(totalPages, 1),
        doclingVersion: data.version || "v0.5.1",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Deterministic Mock Docling Client for Unit & Integration Testing.
 * Used when container runner / Docker is unavailable in local environment.
 */
export class MockDoclingClient implements DoclingClient {
  async health(): Promise<{ status: string; version: string }> {
    return { status: "healthy_mock", version: "mock-v1.18.0" };
  }

  async convertDocument(
    documentId: string,
    fileBytes: Buffer,
    filename: string
  ): Promise<DoclingConversionResult> {
    if (fileBytes.length === 0) {
      throw new Error("DOCLING_TERMINAL_ERROR: Empty (0-byte) file cannot be converted.");
    }

    // Deterministic mock elements reflecting academic syllabus structure
    const elements: DoclingElement[] = [
      {
        type: "heading",
        headingLevel: 1,
        text: "Unit 1: Relational Data Model & DDL",
        page: 1,
      },
      {
        type: "paragraph",
        text: "The CREATE TABLE statement defines relation schemas with attributes, types, and constraints including PRIMARY KEY and FOREIGN KEY.",
        page: 1,
      },
      {
        type: "table",
        text: "Table 1.1: Relational Integrity Constraints",
        page: 2,
        tableData: [
          ["Constraint", "Purpose", "Example"],
          ["PRIMARY KEY", "Unique record identification", "student_id INT PRIMARY KEY"],
          ["FOREIGN KEY", "Referential integrity across tables", "dept_id INT REFERENCES department(id)"],
        ],
      },
      {
        type: "heading",
        headingLevel: 1,
        text: "Unit 2: DML Queries & Conditional Selection",
        page: 3,
      },
      {
        type: "paragraph",
        text: "The SELECT statement retrieves tuples matching WHERE conditions using logical operators AND, OR, and NOT.",
        page: 3,
      },
    ];

    const markdown = elements.map((e) => e.text).join("\n\n");

    return {
      documentId,
      markdown,
      elements,
      totalPages: 3,
      doclingVersion: "mock-v1.18.0",
    };
  }
}
