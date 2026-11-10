# SW-03 academic uploads

Kumpas accepts JPEG, PNG, WEBP and PDF academic documents up to and including 10,000,000 bytes. The system validates actual decoded content, size, ownership and the upload reservation before extraction. It renders every PDF page and preserves the last saved extraction until replacement succeeds.

The system uploads files directly to private temporary Storage through the resumable intake flow. Vercel receives the upload reference and metadata. This supports the 10 MB boundary without passing the complete file through Vercel multipart ingress.

The system supports one document per academic category, explicit replacement/removal, review reset after changes and approval blocking while uploads or unsaved edits remain. Raw objects enter durable cleanup before upload authorization and are deleted after processing, with durable deletion retries.

The system passes byte-boundary, format/decoder, encrypted/multi-page PDF, reservation, replacement, route, cleanup and RLS regressions. Human deployed-upload verification passes.

## Database contract

The system uses `20261104144015_sw03_academic_upload_validation.sql`. Hosted migration readback confirms the applicable contracts are installed.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).
