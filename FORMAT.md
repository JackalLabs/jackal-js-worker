# Chunk Archive Format (CAF) Specification

**Version:** 1.0  
**Purpose:** Efficient storage of multiple files in single chunks with fast random access retrieval  
**Target Use Case:** Streaming files from object storage (S3) into archive chunks for distributed storage (Jackal)

## Overview

The Chunk Archive Format (CAF) is designed to package multiple files into single archive files (chunks) while maintaining the ability to quickly extract individual files without reading the entire archive. This format optimizes for:

- **Storage Efficiency**: Reducing the number of individual files stored on distributed systems
- **Fast Retrieval**: Random access to individual files using byte ranges
- **Streaming Support**: Files can be written to the archive as they are received
- **Size Management**: Configurable maximum chunk size (default: ~30GB, max: 32GB)

## File Structure

A CAF file consists of three main sections:

```
┌─────────────────────────────────────┐
│           File Data Section         │
│  ┌─────────────┐ ┌─────────────┐    │
│  │   File 1    │ │   File 2    │    │
│  │   Data      │ │   Data      │    │
│  └─────────────┘ └─────────────┘    │
│            ... more files ...       │
├─────────────────────────────────────┤
│         File Index Section          │
│        (JSON-encoded map)           │
├─────────────────────────────────────┤
│       Footer (4 bytes)              │
│  ┌───────────────────────────────┐  │
│  │         Index Size            │  │
│  │         (4 bytes)             │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Section Details

### 1. File Data Section

Files are stored sequentially in their original binary form. No compression or encoding is applied at this level - files are stored as-is to maintain integrity and simplify streaming operations.

**Properties:**
- Files are concatenated directly without padding or separators
- Original file content is preserved byte-for-byte
- Files are written in the order they are received

### 2. File Index Section

A JSON-encoded map that provides metadata for fast file location and retrieval.

**Structure:**
```json
{
  "format_version": "1.0",
  "files": {
    "path/to/file1.jpg": {
      "start_byte": 0,
      "end_byte": 1048575,
    },
    "documents/report.pdf": {
      "start_byte": 1048576,
      "end_byte": 2097151,
    }
  }
}
```

**Field Descriptions:**

- `format_version`: CAF format version for future compatibility
- `files`: Map of filename to file metadata
  - `start_byte`: Byte offset where file data begins (0-indexed)
  - `end_byte`: Byte offset where file data ends (exclusive)

### 3. Footer Section (4 bytes)

The footer enables fast parsing by providing the index size.

**Structure:**
```
Bytes 0-3: Index Size (uint32, little-endian)
```

**Details:**
- **Index Size**: Size of the JSON index in bytes (excluding footer)

## Implementation Guidelines

### Creating a CAF File

1. **Initialize**: Open output stream/file for writing
2. **Stream Files**: For each input file:
   - Record current byte position as `start_byte`
   - Stream file data directly to output
   - Record final byte position as `end_byte`
   - Add entry to in-memory file index
   - Check if chunk size limit (~30GB) would be exceeded by next file
3. **Finalize**: When chunk is complete:
   - Serialize file index to JSON
   - Write index to output stream
   - Calculate index size
   - Write footer (index size)

### Reading from a CAF File

#### Fast File Lookup
1. **Read Footer**: Read last 4 bytes of file
2. **Get Index Size**: Extract index size from footer
3. **Read Index**: Read index bytes from `file_size - 4 - index_size`
4. **Parse Index**: JSON decode to get file map
5. **Lookup File**: Find target filename in files map

#### Extract Specific File
1. **Perform Fast Lookup** (above)
2. **Range Read**: Read bytes from `start_byte` to `end_byte`
3. **Return File Data**: File is ready for use

### Size Limits and Constraints

- **Maximum Chunk Size**: 32GB (hard limit for compatibility)
- **Target Chunk Size**: ~30GB (recommended for optimal performance)
- **Maximum Files per Chunk**: No hard limit (limited by JSON parsing and memory)
- **Maximum Filename Length**: No hard limit (limited by JSON and filesystem)
- **Index Size**: Typically <1MB for thousands of files

### Database Integration

When storing data, keeping a reference to which files belong to which CAF files is important. In a database, creating a mapping that includes `filename -> caf_file_id` will yield the best lookup results.

**Example database structure:**
```sql
CREATE TABLE file_locations (
    file_path VARCHAR(512) PRIMARY KEY,
    caf_file_id VARCHAR(50) NOT NULL,
);
```

## Performance Characteristics

### Storage Efficiency
- **Overhead**: ~1MB index per chunk (for typical file counts)
- **Compression**: No built-in compression (can be added at storage layer)
- **Deduplication**: No built-in deduplication (handled at application layer)

### Access Performance
- **Index Lookup**: O(1) average case for file location
- **File Extraction**: Single range read operation
- **Chunk Creation**: O(n) where n is number of files
- **Memory Usage**: Index size (~1MB) + streaming buffers