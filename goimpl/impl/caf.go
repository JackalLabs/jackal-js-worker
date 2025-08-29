package caf

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// CAFFileMetadata represents metadata for a file in the CAF archive
type CAFFileMetadata struct {
	StartByte int64 `json:"start_byte"`
	EndByte   int64 `json:"end_byte"`
}

// CAFIndex represents the index structure of a CAF archive
type CAFIndex struct {
	FormatVersion string                     `json:"format_version"`
	Files         map[string]CAFFileMetadata `json:"files"`
}

// CAFSerializer creates CAF archive files
type CAFSerializer struct {
	outputPath   string
	file         *os.File
	writer       *bufio.Writer
	currentPos   int64
	fileIndex    map[string]CAFFileMetadata
	maxChunkSize int64
	tempFile     bool
}

// NewCAFSerializer creates a new CAF serializer
func NewCAFSerializer(outputPath string, maxChunkSizeGB int) (*CAFSerializer, error) {
	if outputPath == "" {
		tempFile, err := createTempFile()
		if err != nil {
			return nil, fmt.Errorf("failed to create temp file: %w", err)
		}
		outputPath = tempFile
	}

	file, err := os.Create(outputPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create output file: %w", err)
	}

	writer := bufio.NewWriter(file)
	maxChunkSize := int64(maxChunkSizeGB) * 1024 * 1024 * 1024

	return &CAFSerializer{
		outputPath:   outputPath,
		file:         file,
		writer:       writer,
		currentPos:   0,
		fileIndex:    make(map[string]CAFFileMetadata),
		maxChunkSize: maxChunkSize,
		tempFile:     outputPath != "",
	}, nil
}

// createTempFile creates a temporary file for the CAF archive
func createTempFile() (string, error) {
	tempDir := os.TempDir()
	fileName := fmt.Sprintf("caf_%d_%d.caf", time.Now().UnixNano(), os.Getpid())
	return filepath.Join(tempDir, fileName), nil
}

// AddFile adds a file to the CAF archive
func (s *CAFSerializer) AddFile(filePath string, data []byte) (bool, error) {
	// Check if adding this file would exceed the chunk size limit
	if s.currentPos+int64(len(data)) > s.maxChunkSize {
		return false, nil
	}

	startByte := s.currentPos

	// Write file data
	n, err := s.writer.Write(data)
	if err != nil {
		return false, fmt.Errorf("failed to write file data: %w", err)
	}

	if n != len(data) {
		return false, fmt.Errorf("incomplete write: wrote %d bytes, expected %d", n, len(data))
	}

	endByte := s.currentPos + int64(len(data))

	// Add to index
	s.fileIndex[filePath] = CAFFileMetadata{
		StartByte: startByte,
		EndByte:   endByte,
	}

	s.currentPos = endByte
	return true, nil
}

// AddFileFromReader adds a file to the CAF archive from a reader
func (s *CAFSerializer) AddFileFromReader(filePath string, reader io.Reader, contentLength int64) (bool, error) {
	fmt.Printf("CAF: Starting to add file stream: %s (%d bytes)\n", filePath, contentLength)
	fmt.Printf("CAF: Current position: %d, Max size: %d\n", s.currentPos, s.maxChunkSize)

	// Check if adding this file would exceed the chunk size limit
	if s.currentPos+contentLength > s.maxChunkSize {
		fmt.Printf("CAF: File %s would exceed size limit (%d > %d)\n", filePath, s.currentPos+contentLength, s.maxChunkSize)
		return false, nil
	}

	startByte := s.currentPos
	fmt.Printf("CAF: Adding file %s at position %d\n", filePath, startByte)

	startTime := time.Now()

	// Copy data from reader to writer
	written, err := io.Copy(s.writer, reader)
	if err != nil {
		return false, fmt.Errorf("failed to copy data from reader: %w", err)
	}

	if written != contentLength {
		return false, fmt.Errorf("size mismatch: wrote %d bytes, expected %d", written, contentLength)
	}

	endByte := s.currentPos + contentLength
	duration := time.Since(startTime)
	throughput := float64(contentLength) / 1024 / 1024 / duration.Seconds() // MB/s

	fmt.Printf("CAF: Finished streaming %s in %v (%.2f MB/s)\n", filePath, duration, throughput)
	fmt.Printf("CAF: File added to index: %d to %d\n", startByte, endByte)

	// Add to index
	s.fileIndex[filePath] = CAFFileMetadata{
		StartByte: startByte,
		EndByte:   endByte,
	}

	s.currentPos = endByte
	fmt.Printf("CAF: New position: %d\n", s.currentPos)

	return true, nil
}

// AddFileFromPath adds a file from filesystem to the CAF archive
func (s *CAFSerializer) AddFileFromPath(filePath string, sourceFilePath string) (bool, error) {
	data, err := os.ReadFile(sourceFilePath)
	if err != nil {
		return false, fmt.Errorf("failed to read source file: %w", err)
	}
	return s.AddFile(filePath, data)
}

// Cleanup frees resources used by the serializer
func (s *CAFSerializer) Cleanup() error {
	var err error
	if s.writer != nil {
		err = s.writer.Flush()
		s.writer = nil
	}
	if s.file != nil {
		if closeErr := s.file.Close(); closeErr != nil && err == nil {
			err = closeErr
		}
		s.file = nil
	}
	// Clear the file index to free memory
	s.fileIndex = make(map[string]CAFFileMetadata)
	return err
}

// Finalize completes the CAF archive by writing the index and footer
func (s *CAFSerializer) Finalize() (string, error) {
	fmt.Printf("CAF: Starting finalization of %s\n", s.outputPath)
	fmt.Printf("CAF: Final size: %d bytes\n", s.currentPos)
	fmt.Printf("CAF: Total files: %d\n", len(s.fileIndex))

	// Create the index
	index := CAFIndex{
		FormatVersion: "1.0",
		Files:         s.fileIndex,
	}

	indexJSON, err := json.Marshal(index)
	if err != nil {
		return "", fmt.Errorf("failed to marshal index: %w", err)
	}

	indexSize := len(indexJSON)
	fmt.Printf("CAF: Index size: %d bytes\n", indexSize)

	// Write index
	n, err := s.writer.Write(indexJSON)
	if err != nil {
		return "", fmt.Errorf("failed to write index: %w", err)
	}
	if n != indexSize {
		return "", fmt.Errorf("incomplete index write: wrote %d bytes, expected %d", n, indexSize)
	}

	// Write footer (index size as 4-byte little-endian uint32)
	footerBuffer := make([]byte, 4)
	binary.LittleEndian.PutUint32(footerBuffer, uint32(indexSize))

	n, err = s.writer.Write(footerBuffer)
	if err != nil {
		return "", fmt.Errorf("failed to write footer: %w", err)
	}
	if n != 4 {
		return "", fmt.Errorf("incomplete footer write: wrote %d bytes, expected 4", n)
	}

	// Flush and close
	if err := s.writer.Flush(); err != nil {
		return "", fmt.Errorf("failed to flush writer: %w", err)
	}

	if err := s.file.Close(); err != nil {
		return "", fmt.Errorf("failed to close file: %w", err)
	}

	finalSize := s.currentPos + int64(indexSize) + 4
	fmt.Printf("CAF: Successfully finalized %s\n", s.outputPath)
	fmt.Printf("CAF: Final archive size: %d bytes\n", finalSize)

	// Clear resources
	s.writer = nil
	s.file = nil

	return s.outputPath, nil
}

// GetArchivePath returns the current archive file path
func (s *CAFSerializer) GetArchivePath() string {
	return s.outputPath
}

// GetCurrentSize returns the current size of the archive in bytes
func (s *CAFSerializer) GetCurrentSize() int64 {
	return s.currentPos
}

// GetFileList returns the list of files currently in the archive
func (s *CAFSerializer) GetFileList() []string {
	files := make([]string, 0, len(s.fileIndex))
	for filePath := range s.fileIndex {
		files = append(files, filePath)
	}
	return files
}

// GetMaxSize returns the current size limit in bytes
func (s *CAFSerializer) GetMaxSize() int64 {
	return s.maxChunkSize
}

// GetMaxSizeGB returns the current size limit in GB
func (s *CAFSerializer) GetMaxSizeGB() float64 {
	return float64(s.maxChunkSize) / (1024 * 1024 * 1024)
}

// CAFDeserializer reads files from CAF archive files
type CAFDeserializer struct {
	archivePath string
	index       *CAFIndex
	fileSize    int64
}

// NewCAFDeserializer creates a new CAF deserializer
func NewCAFDeserializer(archivePath string) *CAFDeserializer {
	return &CAFDeserializer{
		archivePath: archivePath,
	}
}

// LoadIndex loads the CAF index for fast file lookups
func (d *CAFDeserializer) LoadIndex() error {
	// Get file size
	fileInfo, err := os.Stat(d.archivePath)
	if err != nil {
		return fmt.Errorf("failed to stat archive file: %w", err)
	}
	d.fileSize = fileInfo.Size()

	// Open file for reading
	file, err := os.Open(d.archivePath)
	if err != nil {
		return fmt.Errorf("failed to open archive file: %w", err)
	}
	defer func() { _ = file.Close() }()

	// Read footer (last 4 bytes)
	footerBuffer := make([]byte, 4)
	_, err = file.ReadAt(footerBuffer, d.fileSize-4)
	if err != nil {
		return fmt.Errorf("failed to read footer: %w", err)
	}

	indexSize := binary.LittleEndian.Uint32(footerBuffer)

	// Read index
	indexBuffer := make([]byte, indexSize)
	indexStart := d.fileSize - 4 - int64(indexSize)
	_, err = file.ReadAt(indexBuffer, indexStart)
	if err != nil {
		return fmt.Errorf("failed to read index: %w", err)
	}

	// Parse index
	var index CAFIndex
	if err := json.Unmarshal(indexBuffer, &index); err != nil {
		return fmt.Errorf("failed to parse index: %w", err)
	}

	d.index = &index
	return nil
}

// GetFileList returns all files in the archive
func (d *CAFDeserializer) GetFileList() ([]string, error) {
	if d.index == nil {
		return nil, fmt.Errorf("index not loaded, call LoadIndex() first")
	}

	files := make([]string, 0, len(d.index.Files))
	for filePath := range d.index.Files {
		files = append(files, filePath)
	}
	return files, nil
}

// HasFile checks if a file exists in the archive
func (d *CAFDeserializer) HasFile(filePath string) (bool, error) {
	if d.index == nil {
		return false, fmt.Errorf("index not loaded, call LoadIndex() first")
	}
	_, exists := d.index.Files[filePath]
	return exists, nil
}

// ExtractFile extracts a specific file from the archive
func (d *CAFDeserializer) ExtractFile(filePath string) ([]byte, error) {
	if d.index == nil {
		return nil, fmt.Errorf("index not loaded, call LoadIndex() first")
	}

	fileMetadata, exists := d.index.Files[filePath]
	if !exists {
		return nil, fmt.Errorf("file '%s' not found in archive", filePath)
	}

	fileSize := fileMetadata.EndByte - fileMetadata.StartByte
	buffer := make([]byte, fileSize)

	file, err := os.Open(d.archivePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open archive file: %w", err)
	}
	defer func() { _ = file.Close() }()

	_, err = file.ReadAt(buffer, fileMetadata.StartByte)
	if err != nil {
		return nil, fmt.Errorf("failed to read file data: %w", err)
	}

	return buffer, nil
}

// ExtractFileToPath extracts a file and saves it to the filesystem
func (d *CAFDeserializer) ExtractFileToPath(filePath string, outputPath string) error {
	fileData, err := d.ExtractFile(filePath)
	if err != nil {
		return err
	}

	// Ensure output directory exists
	outputDir := filepath.Dir(outputPath)
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	return os.WriteFile(outputPath, fileData, 0o644)
}

// ExtractAll extracts all files from the archive to a directory
func (d *CAFDeserializer) ExtractAll(outputDir string) error {
	if d.index == nil {
		return fmt.Errorf("index not loaded, call LoadIndex() first")
	}

	// Ensure output directory exists
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	// Extract each file
	for filePath := range d.index.Files {
		outputPath := filepath.Join(outputDir, filePath)

		// Ensure subdirectories exist
		fileDir := filepath.Dir(outputPath)
		if err := os.MkdirAll(fileDir, 0o755); err != nil {
			return fmt.Errorf("failed to create file directory: %w", err)
		}

		if err := d.ExtractFileToPath(filePath, outputPath); err != nil {
			return fmt.Errorf("failed to extract file '%s': %w", filePath, err)
		}
	}

	return nil
}

// GetFileMetadata gets metadata for a specific file
func (d *CAFDeserializer) GetFileMetadata(filePath string) (*CAFFileMetadata, error) {
	if d.index == nil {
		return nil, fmt.Errorf("index not loaded, call LoadIndex() first")
	}

	if metadata, exists := d.index.Files[filePath]; exists {
		return &metadata, nil
	}
	return nil, nil
}

// GetFormatVersion gets the CAF format version
func (d *CAFDeserializer) GetFormatVersion() (string, error) {
	if d.index == nil {
		return "", fmt.Errorf("index not loaded, call LoadIndex() first")
	}
	return d.index.FormatVersion, nil
}

// CAFUtils provides utility functions for CAF operations
type CAFUtils struct{}

// ValidateArchive validates a CAF archive structure
func (u *CAFUtils) ValidateArchive(archivePath string) (bool, error) {
	deserializer := NewCAFDeserializer(archivePath)
	if err := deserializer.LoadIndex(); err != nil {
		return false, err
	}

	// Basic validation - check format version
	version, err := deserializer.GetFormatVersion()
	if err != nil {
		return false, err
	}

	return version == "1.0", nil
}

// ArchiveStats represents statistics about a CAF archive
type ArchiveStats struct {
	TotalFiles    int        `json:"total_files"`
	TotalSize     int64      `json:"total_size"`
	FormatVersion string     `json:"format_version"`
	Files         []FileInfo `json:"files"`
}

// FileInfo represents information about a file in the archive
type FileInfo struct {
	Path string `json:"path"`
	Size int64  `json:"size"`
}

// GetArchiveStats gets archive statistics
func (u *CAFUtils) GetArchiveStats(archivePath string) (*ArchiveStats, error) {
	deserializer := NewCAFDeserializer(archivePath)
	if err := deserializer.LoadIndex(); err != nil {
		return nil, err
	}

	fileList, err := deserializer.GetFileList()
	if err != nil {
		return nil, err
	}

	fileInfo, err := os.Stat(archivePath)
	if err != nil {
		return nil, err
	}

	files := make([]FileInfo, len(fileList))
	for i, filePath := range fileList {
		metadata, err := deserializer.GetFileMetadata(filePath)
		if err != nil {
			return nil, err
		}
		files[i] = FileInfo{
			Path: filePath,
			Size: metadata.EndByte - metadata.StartByte,
		}
	}

	version, err := deserializer.GetFormatVersion()
	if err != nil {
		return nil, err
	}

	return &ArchiveStats{
		TotalFiles:    len(fileList),
		TotalSize:     fileInfo.Size(),
		FormatVersion: version,
		Files:         files,
	}, nil
}
