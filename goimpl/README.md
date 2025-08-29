# CAF CLI - Go Implementation

A Go implementation of the CAF (Chunk Archive Format) serializer/deserializer with a Cobra CLI interface.

## Overview

This Go implementation provides the same functionality as the TypeScript version, implementing the CAF specification v1.0 for efficient storage of multiple files in single chunks with fast random access retrieval.

## Project Structure

```
goimpl/
├── impl/
│   └── caf.go          # CAF serializer and deserializer implementation
├── main.go             # Cobra CLI application
├── go.mod              # Go module definition
├── cafcli              # Compiled binary (after build)
└── README.md           # This file
```

## Building

### Quick Build
```bash
cd goimpl
go mod tidy
go build -o cafcli .
```

### Multi-Platform Build
Use the provided build script to build for all supported platforms:

```bash
cd goimpl
./build.sh
```

This will create binaries for:
- Linux (x64, ARM64)
- macOS (Intel, Apple Silicon)
- Windows (x64)

All binaries will be placed in the `dist/` directory with proper version information embedded.

### Custom Version Build
You can specify a custom version when building:

```bash
VERSION=v1.0.0 ./build.sh
```

### Development

#### Linting and Formatting
Use the provided lint script to format and lint the code:

```bash
./lint.sh
```

This script will:
- Install `gofumpt` and `golangci-lint` if they're not already installed
- Format all Go code using `gofumpt` (more strict than `gofmt`)
- Run `golangci-lint` to check for common issues and style problems

#### Automated Builds
The project includes GitHub Actions for automated nightly builds. See [.github/workflows/README.md](../.github/workflows/README.md) for details.

## Usage

The CLI provides several commands for working with CAF archives:

### Create CAF Archive

```bash
./cafcli create <output-file> <input-paths...> [flags]
```

Create a new CAF archive from files and directories.

**Examples:**
```bash
# Create archive from a single file
./cafcli create archive.caf document.pdf

# Create archive from multiple files
./cafcli create archive.caf file1.txt file2.txt data.json

# Create archive from a directory (scans one level deep)
./cafcli create archive.caf my_documents/

# Create archive with custom settings
./cafcli create archive.caf documents/ --max-size 10 --verbose

# Use custom base directory for relative paths
./cafcli create archive.caf docs/file1.txt docs/file2.txt --base-dir docs
```

**Flags:**
- `--max-size, -s`: Maximum archive size in GB (default: 30)
- `--verbose, -v`: Show detailed progress information
- `--base-dir, -b`: Base directory for relative paths (default: current directory)

**Notes:**
- Directories are scanned one level deep only (subdirectories are skipped)
- Duplicate files are automatically avoided
- Files maintain their relative paths in the archive
- Archive creation stops if size limit would be exceeded

### List Files in Archive

```bash
./cafcli list <caf-file>
```

Example:
```bash
./cafcli list archive.caf
```

This will display:
- Archive path and format version
- Total number of files
- List of all files with their sizes

### Extract All Files (Split)

```bash
./cafcli split <caf-file> [--output <directory>]
```

Examples:
```bash
# Extract to default 'extracted_files' directory
./cafcli split archive.caf

# Extract to custom directory
./cafcli split archive.caf --output /path/to/extract
```

### Extract Specific File

```bash
./cafcli extract <caf-file> <file-path> <output-path>
```

Example:
```bash
./cafcli extract archive.caf documents/report.pdf ./extracted_report.pdf
```

### Validate Archive

```bash
./cafcli validate <caf-file>
```

Checks if the CAF archive is properly formatted and valid.

### Show Archive Statistics

```bash
./cafcli stats <caf-file> [--verbose]
```

Examples:
```bash
# Basic statistics
./cafcli stats archive.caf

# Detailed statistics with file list
./cafcli stats archive.caf --verbose
```

## Go Package Usage

You can also use the CAF implementation as a Go package:

```go
package main

import (
    "fmt"
    "cafcli/impl"
)

func main() {
    // Create a CAF archive
    serializer, err := caf.NewCAFSerializer("archive.caf", 30) // 30GB limit
    if err != nil {
        panic(err)
    }
    defer serializer.Cleanup()
    
    // Add files
    added, err := serializer.AddFile("hello.txt", []byte("Hello, World!"))
    if err != nil {
        panic(err)
    }
    
    // Finalize archive
    archivePath, err := serializer.Finalize()
    if err != nil {
        panic(err)
    }
    
    fmt.Printf("Archive created: %s\n", archivePath)
    
    // Read from archive
    deserializer := caf.NewCAFDeserializer(archivePath)
    if err := deserializer.LoadIndex(); err != nil {
        panic(err)
    }
    
    // Extract file
    data, err := deserializer.ExtractFile("hello.txt")
    if err != nil {
        panic(err)
    }
    
    fmt.Printf("Extracted: %s\n", string(data))
}
```

## Features

### CAFSerializer
- Create CAF archives with configurable size limits
- Add files from byte arrays, readers, or filesystem paths
- Stream files directly to archive for memory efficiency
- Automatic size limit checking
- Progress reporting for large files
- Proper resource cleanup

### CAFDeserializer
- Fast index loading for O(1) file lookups
- Extract individual files or entire archives
- Memory-efficient random access to files
- File existence checking
- Metadata retrieval

### CAFUtils
- Archive validation
- Detailed statistics reporting
- Format version checking

## Compatibility

This Go implementation is fully compatible with CAF files created by the TypeScript version and vice versa. Both implementations follow the same CAF specification v1.0.

## Performance

The Go implementation provides:
- Fast archive creation with streaming support
- O(1) file lookup performance
- Memory-efficient operations for large files
- Concurrent-safe operations
- Minimal memory overhead

## Error Handling

The implementation includes comprehensive error handling for:
- File system operations
- Archive corruption detection
- Size limit enforcement
- Invalid file paths
- Memory allocation failures

## Dependencies

- `github.com/spf13/cobra` - CLI framework
- Go standard library only for core CAF functionality
