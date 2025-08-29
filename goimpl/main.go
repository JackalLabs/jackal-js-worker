package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	caf "cafcli/impl"

	"github.com/spf13/cobra"
)

// Version information (set by build flags)
var (
	version = "dev"
	commit  = "unknown"
	date    = "unknown"
)

// FileToArchive represents a file to be added to the archive
type FileToArchive struct {
	SourcePath  string // Path to the file on disk
	ArchivePath string // Path to store in the archive
}

var rootCmd = &cobra.Command{
	Use:   "cafcli",
	Short: "CAF (Chunk Archive Format) CLI tool",
	Long: `A command line interface for working with CAF (Chunk Archive Format) files.
CAF is designed for efficient storage of multiple files in single chunks with fast random access retrieval.`,
	Version: version,
}

var listCmd = &cobra.Command{
	Use:   "list <caf-file>",
	Short: "List all files in a CAF archive",
	Long:  `Lists all files contained in the specified CAF archive along with their sizes.`,
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cafFile := args[0]

		// Check if file exists
		if _, err := os.Stat(cafFile); os.IsNotExist(err) {
			return fmt.Errorf("CAF file does not exist: %s", cafFile)
		}

		// Create deserializer and load index
		deserializer := caf.NewCAFDeserializer(cafFile)
		if err := deserializer.LoadIndex(); err != nil {
			return fmt.Errorf("failed to load CAF index: %w", err)
		}

		// Get file list
		files, err := deserializer.GetFileList()
		if err != nil {
			return fmt.Errorf("failed to get file list: %w", err)
		}

		// Get format version
		version, err := deserializer.GetFormatVersion()
		if err != nil {
			return fmt.Errorf("failed to get format version: %w", err)
		}

		// Print archive info
		fmt.Printf("CAF Archive: %s\n", cafFile)
		fmt.Printf("Format Version: %s\n", version)
		fmt.Printf("Total Files: %d\n\n", len(files))

		// Print file list with sizes
		fmt.Printf("%-50s %12s\n", "File Path", "Size (bytes)")
		fmt.Printf("%s\n", strings.Repeat("-", 65))

		for _, filePath := range files {
			metadata, err := deserializer.GetFileMetadata(filePath)
			if err != nil {
				return fmt.Errorf("failed to get metadata for file %s: %w", filePath, err)
			}

			size := metadata.EndByte - metadata.StartByte
			fmt.Printf("%-50s %12d\n", filePath, size)
		}

		return nil
	},
}

var splitCmd = &cobra.Command{
	Use:   "split <caf-file>",
	Short: "Extract all files from a CAF archive to a directory",
	Long:  `Extracts all files from the specified CAF archive into a directory called 'extracted_files'.`,
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cafFile := args[0]

		// Check if file exists
		if _, err := os.Stat(cafFile); os.IsNotExist(err) {
			return fmt.Errorf("CAF file does not exist: %s", cafFile)
		}

		// Create output directory
		outputDir := "extracted_files"
		customDir, _ := cmd.Flags().GetString("output")
		if customDir != "" {
			outputDir = customDir
		}

		// Create deserializer and load index
		deserializer := caf.NewCAFDeserializer(cafFile)
		if err := deserializer.LoadIndex(); err != nil {
			return fmt.Errorf("failed to load CAF index: %w", err)
		}

		// Get file list for progress reporting
		files, err := deserializer.GetFileList()
		if err != nil {
			return fmt.Errorf("failed to get file list: %w", err)
		}

		fmt.Printf("Extracting %d files from %s to %s...\n", len(files), cafFile, outputDir)

		// Extract all files
		if err := deserializer.ExtractAll(outputDir); err != nil {
			return fmt.Errorf("failed to extract files: %w", err)
		}

		fmt.Printf("Successfully extracted %d files to %s\n", len(files), outputDir)
		return nil
	},
}

var extractCmd = &cobra.Command{
	Use:   "extract <caf-file> <file-path> <output-path>",
	Short: "Extract a specific file from a CAF archive",
	Long:  `Extracts a specific file from the CAF archive to the specified output location.`,
	Args:  cobra.ExactArgs(3),
	RunE: func(cmd *cobra.Command, args []string) error {
		cafFile := args[0]
		filePath := args[1]
		outputPath := args[2]

		// Check if CAF file exists
		if _, err := os.Stat(cafFile); os.IsNotExist(err) {
			return fmt.Errorf("CAF file does not exist: %s", cafFile)
		}

		// Create deserializer and load index
		deserializer := caf.NewCAFDeserializer(cafFile)
		if err := deserializer.LoadIndex(); err != nil {
			return fmt.Errorf("failed to load CAF index: %w", err)
		}

		// Check if file exists in archive
		hasFile, err := deserializer.HasFile(filePath)
		if err != nil {
			return fmt.Errorf("failed to check file existence: %w", err)
		}
		if !hasFile {
			return fmt.Errorf("file '%s' not found in archive", filePath)
		}

		// Get file metadata for size info
		metadata, err := deserializer.GetFileMetadata(filePath)
		if err != nil {
			return fmt.Errorf("failed to get file metadata: %w", err)
		}

		fileSize := metadata.EndByte - metadata.StartByte
		fmt.Printf("Extracting file '%s' (%d bytes) to '%s'...\n", filePath, fileSize, outputPath)

		// Extract the file
		if err := deserializer.ExtractFileToPath(filePath, outputPath); err != nil {
			return fmt.Errorf("failed to extract file: %w", err)
		}

		fmt.Printf("Successfully extracted '%s' to '%s'\n", filePath, outputPath)
		return nil
	},
}

var validateCmd = &cobra.Command{
	Use:   "validate <caf-file>",
	Short: "Validate a CAF archive",
	Long:  `Validates the structure and integrity of a CAF archive file.`,
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cafFile := args[0]

		// Check if file exists
		if _, err := os.Stat(cafFile); os.IsNotExist(err) {
			return fmt.Errorf("CAF file does not exist: %s", cafFile)
		}

		utils := &caf.CAFUtils{}
		isValid, err := utils.ValidateArchive(cafFile)
		if err != nil {
			return fmt.Errorf("validation failed: %w", err)
		}

		if isValid {
			fmt.Printf("✓ CAF archive '%s' is valid\n", cafFile)
		} else {
			fmt.Printf("✗ CAF archive '%s' is invalid\n", cafFile)
		}

		return nil
	},
}

var statsCmd = &cobra.Command{
	Use:   "stats <caf-file>",
	Short: "Show statistics about a CAF archive",
	Long:  `Displays detailed statistics about a CAF archive including total size, file count, and file details.`,
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cafFile := args[0]

		// Check if file exists
		if _, err := os.Stat(cafFile); os.IsNotExist(err) {
			return fmt.Errorf("CAF file does not exist: %s", cafFile)
		}

		utils := &caf.CAFUtils{}
		stats, err := utils.GetArchiveStats(cafFile)
		if err != nil {
			return fmt.Errorf("failed to get archive statistics: %w", err)
		}

		fmt.Printf("CAF Archive Statistics: %s\n", cafFile)
		fmt.Printf("Format Version: %s\n", stats.FormatVersion)
		fmt.Printf("Total Files: %d\n", stats.TotalFiles)
		fmt.Printf("Total Size: %d bytes (%.2f MB)\n", stats.TotalSize, float64(stats.TotalSize)/(1024*1024))

		// Calculate average file size
		if stats.TotalFiles > 0 {
			totalContentSize := int64(0)
			for _, file := range stats.Files {
				totalContentSize += file.Size
			}
			avgSize := totalContentSize / int64(stats.TotalFiles)
			fmt.Printf("Average File Size: %d bytes (%.2f KB)\n", avgSize, float64(avgSize)/1024)
		}

		// Show detailed file information if requested
		verbose, _ := cmd.Flags().GetBool("verbose")
		if verbose {
			fmt.Printf("\nFile Details:\n")
			fmt.Printf("%-50s %12s\n", "File Path", "Size (bytes)")
			fmt.Printf("%s\n", strings.Repeat("-", 65))

			for _, file := range stats.Files {
				fmt.Printf("%-50s %12d\n", file.Path, file.Size)
			}
		}

		return nil
	},
}

var createCmd = &cobra.Command{
	Use:   "create <output-file> <input-paths...>",
	Short: "Create a CAF archive from files and directories",
	Long: `Creates a new CAF archive from the specified files and directories.
Files are added to the archive preserving their relative paths.
Directories are scanned one level deep for files.`,
	Args: cobra.MinimumNArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		outputPath := args[0]
		inputPaths := args[1:]

		// Get flags
		maxSizeGB, _ := cmd.Flags().GetInt("max-size")
		verbose, _ := cmd.Flags().GetBool("verbose")
		baseDir, _ := cmd.Flags().GetString("base-dir")

		if verbose {
			fmt.Printf("Creating CAF archive: %s\n", outputPath)
			fmt.Printf("Max size: %d GB\n", maxSizeGB)
			if baseDir != "" {
				fmt.Printf("Base directory: %s\n", baseDir)
			}
		}

		// Collect all files to archive
		filesToArchive, err := collectFiles(inputPaths, baseDir, verbose)
		if err != nil {
			return fmt.Errorf("failed to collect files: %w", err)
		}

		if len(filesToArchive) == 0 {
			return fmt.Errorf("no files found to archive")
		}

		if verbose {
			fmt.Printf("Found %d files to archive\n", len(filesToArchive))
		}

		// Create serializer
		serializer, err := caf.NewCAFSerializer(outputPath, maxSizeGB)
		if err != nil {
			return fmt.Errorf("failed to create serializer: %w", err)
		}
		defer func() { _ = serializer.Cleanup() }()

		// Add files to archive
		filesAdded := 0
		for _, fileInfo := range filesToArchive {
			if verbose {
				fmt.Printf("Adding: %s -> %s\n", fileInfo.SourcePath, fileInfo.ArchivePath)
			}

			added, err := serializer.AddFileFromPath(fileInfo.ArchivePath, fileInfo.SourcePath)
			if err != nil {
				return fmt.Errorf("failed to add file '%s': %w", fileInfo.SourcePath, err)
			}

			if !added {
				fmt.Printf("Warning: File '%s' skipped (would exceed size limit)\n", fileInfo.SourcePath)
				break
			}

			filesAdded++
		}

		if filesAdded == 0 {
			return fmt.Errorf("no files were added to the archive")
		}

		// Finalize archive
		finalPath, err := serializer.Finalize()
		if err != nil {
			return fmt.Errorf("failed to finalize archive: %w", err)
		}

		fmt.Printf("Successfully created CAF archive: %s\n", finalPath)
		fmt.Printf("Files added: %d/%d\n", filesAdded, len(filesToArchive))
		fmt.Printf("Archive size: %d bytes\n", serializer.GetCurrentSize())

		return nil
	},
}

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Show version information",
	Long:  `Displays detailed version and build information for the CAF CLI.`,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("CAF CLI %s\n", version)
		fmt.Printf("Commit: %s\n", commit)
		fmt.Printf("Build Date: %s\n", date)
		fmt.Printf("CAF Format Version: 1.0\n")
	},
}

func init() {
	// Add commands to root
	rootCmd.AddCommand(createCmd)
	rootCmd.AddCommand(listCmd)
	rootCmd.AddCommand(splitCmd)
	rootCmd.AddCommand(extractCmd)
	rootCmd.AddCommand(validateCmd)
	rootCmd.AddCommand(statsCmd)
	rootCmd.AddCommand(versionCmd)

	// Add flags
	createCmd.Flags().IntP("max-size", "s", 30, "Maximum archive size in GB")
	createCmd.Flags().BoolP("verbose", "v", false, "Show detailed progress information")
	createCmd.Flags().StringP("base-dir", "b", "", "Base directory for relative paths (default: current directory)")

	splitCmd.Flags().StringP("output", "o", "", "Output directory for extracted files (default: extracted_files)")
	statsCmd.Flags().BoolP("verbose", "v", false, "Show detailed file information")
}

// collectFiles gathers all files to be archived from the input paths
func collectFiles(inputPaths []string, baseDir string, verbose bool) ([]FileToArchive, error) {
	var files []FileToArchive
	seen := make(map[string]bool) // Prevent duplicate files

	// Use current directory as base if not specified
	if baseDir == "" {
		var err error
		baseDir, err = os.Getwd()
		if err != nil {
			return nil, fmt.Errorf("failed to get current directory: %w", err)
		}
	}

	// Make baseDir absolute
	baseDir, err := filepath.Abs(baseDir)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve base directory: %w", err)
	}

	for _, inputPath := range inputPaths {
		// Make input path absolute
		absPath, err := filepath.Abs(inputPath)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve path '%s': %w", inputPath, err)
		}

		// Check if path exists
		info, err := os.Stat(absPath)
		if err != nil {
			return nil, fmt.Errorf("failed to access path '%s': %w", inputPath, err)
		}

		if info.IsDir() {
			// Scan directory (one level deep only)
			dirFiles, err := collectFromDirectory(absPath, baseDir, verbose)
			if err != nil {
				return nil, fmt.Errorf("failed to scan directory '%s': %w", inputPath, err)
			}

			// Add files, avoiding duplicates
			for _, file := range dirFiles {
				if !seen[file.SourcePath] {
					files = append(files, file)
					seen[file.SourcePath] = true
				}
			}
		} else {
			// Single file
			archivePath, err := getArchivePath(absPath, baseDir)
			if err != nil {
				return nil, fmt.Errorf("failed to determine archive path for '%s': %w", inputPath, err)
			}

			if !seen[absPath] {
				files = append(files, FileToArchive{
					SourcePath:  absPath,
					ArchivePath: archivePath,
				})
				seen[absPath] = true
			}
		}
	}

	return files, nil
}

// collectFromDirectory scans a directory one level deep for files
func collectFromDirectory(dirPath, baseDir string, verbose bool) ([]FileToArchive, error) {
	var files []FileToArchive

	if verbose {
		fmt.Printf("Scanning directory: %s\n", dirPath)
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			// Skip subdirectories (only scan one level deep)
			if verbose {
				fmt.Printf("Skipping subdirectory: %s\n", entry.Name())
			}
			continue
		}

		// Regular file
		filePath := filepath.Join(dirPath, entry.Name())
		archivePath, err := getArchivePath(filePath, baseDir)
		if err != nil {
			return nil, fmt.Errorf("failed to determine archive path for '%s': %w", filePath, err)
		}

		files = append(files, FileToArchive{
			SourcePath:  filePath,
			ArchivePath: archivePath,
		})

		if verbose {
			fmt.Printf("Found file: %s -> %s\n", filePath, archivePath)
		}
	}

	return files, nil
}

// getArchivePath determines the path to use for a file within the archive
func getArchivePath(filePath, baseDir string) (string, error) {
	// Try to make the path relative to baseDir
	relPath, err := filepath.Rel(baseDir, filePath)
	if err != nil {
		// If we can't make it relative, use just the filename
		return filepath.Base(filePath), nil
	}

	// If the relative path goes up (..), use just the filename
	if strings.HasPrefix(relPath, "..") {
		return filepath.Base(filePath), nil
	}

	// Use the relative path, ensuring forward slashes for consistency
	return filepath.ToSlash(relPath), nil
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
