export const CLIENT_LOGO_SOURCE_BASELINE = Object.freeze({
  rows: 54,
  parentKeys: 54,
  totalBytes: 1_541_428,
  extractionSha256: '40EBF988D4C952A676A4A00A403AE9576D87C18E35D4F7E3BAD0A62DF92D5979',
  complexCsvBytes: 4_450,
  complexCsvSha256: 'effd8f32640367a54da029ba39507e44ef26cc059cab1234361a94a5ba93016c',
  mimeCounts: Object.freeze({ 'image/gif': 2, 'image/jpeg': 23, 'image/png': 29 }),
  digest: '320d0b7301b5e0cc27ea342fc86c1384dabf7cdb5f5bfe2a38d658bf3268f801',
});

export const CLIENT_LOGO_RESULT_BASELINE = Object.freeze({
  auditRows: 54,
  distinctClients: 54,
  totalBytes: 1_541_428,
  digest: '5fa708e0a5ade8bb1b9b81cc16d4a9a3d225d7226e0043e71968ca128c7bdf1f',
});

/**
 * Source digest contract
 * ----------------------
 * SHA-256 of the UTF-8 JSON encoding of one array, ordered by numeric
 * parent_key and then durable source key. Each entry is:
 *
 *   [exact parent_key, file_name, file_type, byte_size, stored_path,
 *    source_record_key, extraction_sha256, detected_mime, actual_bytes,
 *    actual_sha256]
 *
 * It excludes the CSV filename and row position, extraction-machine paths,
 * file timestamps and database-generated values.
 *
 * Result digest contract
 * ----------------------
 * SHA-256 of the UTF-8 JSON encoding of one array in the same order. Each
 * entry is:
 *
 *   [numeric parent_key, transformed client_id, source_record_key,
 *    extraction_sha256, stored_path, file_name, detected_mime, actual_bytes,
 *    actual_sha256, relative_destination]
 *
 * It excludes absolute source/runtime roots, generated database IDs and all
 * timestamps. The result therefore stays reproducible across Windows and
 * Linux and survives a clean database rebuild.
 */
