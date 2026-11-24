# Document Ingestion Worker (`services/ingestion-worker`)

## Architecture & Integration Choice

As determined in ADR-005, document parsing is delegated to an official, containerized **Docling Serve** service rather than embedding deep learning OCR dependencies inside serverless handlers or cloning the large upstream repository.

### Container Details
- **Container Registry:** `quay.io/ds4sd/docling-serve-cpu`
- **Target Version:** `v1.18.0` / `latest`
- **Port:** `5001`
- **License:** MIT (Docling project)

### Tested API Contract
- **Liveness Health Check:** `GET /health` -> `200 OK`
- **Readiness Check:** `GET /ready` -> `200 OK`
- **Version Endpoint:** `GET /version` -> JSON containing `docling`, `docling-serve`, `docling-core` versions
- **Synchronous Conversion:** `POST /v1alpha/convert/source` (multipart/form-data with file or URL payload)
- **Async Job Conversion:** `POST /v1alpha/convert/source/async` (task submission returning job ID, polled via `GET /v1alpha/convert/source/async/{task_id}`)

### Provenance Extraction
The ingestion worker maps Docling's structural JSON representation to our canonical database chunk schema:
- `document_id`: UUID
- `tenant_id`: UUID
- `course_offering_id`: UUID
- `page_number`: Integer
- `section_header`: String
- `content_hash`: SHA-256
- `extracted_markdown`: String
- `tables_json`: Structured table metadata
