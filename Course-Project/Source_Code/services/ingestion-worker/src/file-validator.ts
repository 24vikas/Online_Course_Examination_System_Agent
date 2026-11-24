import crypto from "crypto";

export interface FileValidationResult {
  valid: boolean;
  mimeType: string;
  extension: string;
  fileSizeBytes: number;
  sha256Hash: string;
  detectedFormat: string;
  error?: string;
}

export interface FileValidationOptions {
  maxSizeBytes?: number;
  minSizeBytes?: number;
}

const DEFAULT_MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const DEFAULT_MIN_SIZE_BYTES = 1; // 1 byte

export const SUPPORTED_EXTENSIONS_MAP: Record<string, { mimeTypes: string[]; format: string }> = {
  ".pdf": {
    mimeTypes: ["application/pdf"],
    format: "PDF",
  },
  ".docx": {
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"],
    format: "DOCX",
  },
  ".doc": {
    mimeTypes: ["application/msword", "application/octet-stream"],
    format: "DOC",
  },
  ".pptx": {
    mimeTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/zip"],
    format: "PPTX",
  },
  ".ppt": {
    mimeTypes: ["application/vnd.ms-powerpoint", "application/octet-stream"],
    format: "PPT",
  },
  ".xlsx": {
    mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"],
    format: "XLSX",
  },
  ".csv": {
    mimeTypes: ["text/csv", "application/csv", "text/plain"],
    format: "CSV",
  },
  ".txt": {
    mimeTypes: ["text/plain"],
    format: "TXT",
  },
  ".md": {
    mimeTypes: ["text/markdown", "text/x-markdown", "text/plain"],
    format: "MD",
  },
  ".html": {
    mimeTypes: ["text/html"],
    format: "HTML",
  },
  ".htm": {
    mimeTypes: ["text/html"],
    format: "HTML",
  },
  ".json": {
    mimeTypes: ["application/json", "text/json", "text/plain"],
    format: "JSON",
  },
};

/**
 * Validates file buffer, filename, MIME type, magic bytes, and size bounds.
 */
export function validateUploadFile(
  buffer: Buffer,
  filename: string,
  declaredMimeType?: string,
  options?: FileValidationOptions
): FileValidationResult {
  const maxBytes = options?.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  const minBytes = options?.minSizeBytes ?? DEFAULT_MIN_SIZE_BYTES;
  const fileSizeBytes = buffer.length;

  const sha256Hash = crypto.createHash("sha256").update(buffer).digest("hex");

  // 1. Size bounds validation
  if (fileSizeBytes < minBytes) {
    return {
      valid: false,
      mimeType: declaredMimeType || "unknown",
      extension: "",
      fileSizeBytes,
      sha256Hash,
      detectedFormat: "UNKNOWN",
      error: `FILE_TOO_SMALL: File size ${fileSizeBytes} bytes is below the minimum required ${minBytes} byte(s).`,
    };
  }

  if (fileSizeBytes > maxBytes) {
    return {
      valid: false,
      mimeType: declaredMimeType || "unknown",
      extension: "",
      fileSizeBytes,
      sha256Hash,
      detectedFormat: "UNKNOWN",
      error: `FILE_TOO_LARGE: File size ${fileSizeBytes} bytes exceeds maximum allowed limit of ${maxBytes} bytes (100 MB).`,
    };
  }

  // 2. Extension extraction
  const extMatch = filename.toLowerCase().match(/\.[a-z0-9]+$/);
  const extension = extMatch ? extMatch[0] : "";
  const extConfig = SUPPORTED_EXTENSIONS_MAP[extension];

  if (!extConfig) {
    return {
      valid: false,
      mimeType: declaredMimeType || "application/octet-stream",
      extension,
      fileSizeBytes,
      sha256Hash,
      detectedFormat: "UNSUPPORTED",
      error: `UNSUPPORTED_EXTENSION: File extension '${extension}' is not supported. Supported: PDF, DOCX, XLSX/CSV, PPTX, TXT/MD/HTML, JSON.`,
    };
  }

  // 3. Magic bytes / header inspection
  const headerHex = buffer.subarray(0, 8).toString("hex").toUpperCase();
  const headerAscii = buffer.subarray(0, 8).toString("ascii");

  let formatDetected = extConfig.format;
  let resolvedMimeType = declaredMimeType || extConfig.mimeTypes[0];

  if (extension === ".pdf") {
    // PDF must start with %PDF- (hex: 25 50 44 46 2d)
    if (!headerAscii.startsWith("%PDF-")) {
      return {
        valid: false,
        mimeType: "application/pdf",
        extension,
        fileSizeBytes,
        sha256Hash,
        detectedFormat: "INVALID_PDF",
        error: "CORRUPTED_PDF: File lacks valid %PDF- magic header.",
      };
    }
    resolvedMimeType = "application/pdf";
  } else if (extension === ".docx" || extension === ".pptx" || extension === ".xlsx") {
    // OpenXML Office documents are zip archives starting with PK\x03\x04 (hex: 50 4b 03 04)
    if (!headerHex.startsWith("504B0304")) {
      return {
        valid: false,
        mimeType: resolvedMimeType,
        extension,
        fileSizeBytes,
        sha256Hash,
        detectedFormat: `INVALID_${extConfig.format}`,
        error: `CORRUPTED_OFFICE_DOCUMENT: ${extConfig.format} file lacks valid PK ZIP container signature.`,
      };
    }
  } else if (extension === ".json") {
    try {
      JSON.parse(buffer.toString("utf-8"));
      resolvedMimeType = "application/json";
    } catch (e: any) {
      return {
        valid: false,
        mimeType: "application/json",
        extension,
        fileSizeBytes,
        sha256Hash,
        detectedFormat: "INVALID_JSON",
        error: `MALFORMED_JSON: File content is not valid JSON (${e.message}).`,
      };
    }
  } else if (extension === ".html" || extension === ".htm") {
    resolvedMimeType = "text/html";
  } else if (extension === ".csv") {
    resolvedMimeType = "text/csv";
  } else if (extension === ".md") {
    resolvedMimeType = "text/markdown";
  } else if (extension === ".txt") {
    resolvedMimeType = "text/plain";
  }

  // 4. Declared MIME validation if provided
  if (declaredMimeType && declaredMimeType !== "application/octet-stream") {
    const isMimeAllowed = extConfig.mimeTypes.includes(declaredMimeType);
    if (!isMimeAllowed) {
      // Invariant check: warn or reconcile
      resolvedMimeType = extConfig.mimeTypes[0];
    }
  }

  return {
    valid: true,
    mimeType: resolvedMimeType,
    extension,
    fileSizeBytes,
    sha256Hash,
    detectedFormat: formatDetected,
  };
}
