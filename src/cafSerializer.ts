import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * CAF (Chunk Archive Format) TypeScript interfaces and implementation
 * Based on the CAF specification v1.0
 */

// Type definitions based on FORMAT.md
export interface CAFFileMetadata {
  start_byte: number;
  end_byte: number;
}

export interface CAFIndex {
  format_version: string;
  files: Record<string, CAFFileMetadata>;
}

export interface CAFFile {
  path: string;
  data: Buffer;
}

/**
 * CAF Serializer - Creates CAF archive files
 */
export class CAFSerializer {
  private outputPath: string;
  private writeStream: fs.WriteStream;
  private currentPosition: number = 0;
  private fileIndex: Record<string, CAFFileMetadata> = {};
  private maxChunkSize: number;

  constructor(outputPath?: string, maxChunkSizeGB: number = 30) {
    this.outputPath = outputPath || this.createTempFile();
    this.maxChunkSize = maxChunkSizeGB * 1024 * 1024 * 1024; // Convert GB to bytes
    this.writeStream = fs.createWriteStream(this.outputPath);
  }

  /**
   * Creates a temporary file for the CAF archive
   */
  private createTempFile(): string {
    const tempDir = os.tmpdir();
    const fileName = `caf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.caf`;
    return path.join(tempDir, fileName);
  }

  /**
   * Adds a file to the CAF archive
   * @param filePath - The path/name to store the file as in the archive
   * @param fileData - The file data as a Buffer
   * @returns Promise<boolean> - true if file was added, false if it would exceed chunk size
   */
  public async addFile(filePath: string, fileData: Buffer): Promise<boolean> {
    // Check if adding this file would exceed the chunk size limit
    if (this.currentPosition + fileData.length > this.maxChunkSize) {
      return false;
    }

    const startByte = this.currentPosition;
    
    // Write file data to stream
    return new Promise<boolean>((resolve, reject) => {
      this.writeStream.write(fileData, (error) => {
        if (error) {
          reject(error);
          return;
        }

        const endByte = this.currentPosition + fileData.length;
        
        // Add to index
        this.fileIndex[filePath] = {
          start_byte: startByte,
          end_byte: endByte
        };

        this.currentPosition = endByte;
        resolve(true);
      });
    });
  }

  /**
   * Adds a file from filesystem to the CAF archive
   * @param filePath - The path/name to store the file as in the archive
   * @param sourceFilePath - Path to the source file on filesystem
   * @returns Promise<boolean> - true if file was added, false if it would exceed chunk size
   */
  public async addFileFromPath(filePath: string, sourceFilePath: string): Promise<boolean> {
    const fileData = await fs.promises.readFile(sourceFilePath);
    return this.addFile(filePath, fileData);
  }

  /**
   * Finalizes the CAF archive by writing the index and footer
   */
  public async finalize(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      // Create the index
      const index: CAFIndex = {
        format_version: "1.0",
        files: this.fileIndex
      };

      const indexJson = JSON.stringify(index);
      const indexBuffer = Buffer.from(indexJson, 'utf8');
      const indexSize = indexBuffer.length;

      // Write index
      this.writeStream.write(indexBuffer, (error) => {
        if (error) {
          reject(error);
          return;
        }

        // Write footer (index size as 4-byte little-endian uint32)
        const footerBuffer = Buffer.allocUnsafe(4);
        footerBuffer.writeUInt32LE(indexSize, 0);

        this.writeStream.write(footerBuffer, (error) => {
          if (error) {
            reject(error);
            return;
          }

          this.writeStream.end(() => {
            resolve(this.outputPath);
          });
        });
      });
    });
  }

  /**
   * Gets the current archive file path
   */
  public getArchivePath(): string {
    return this.outputPath;
  }

  /**
   * Gets the current size of the archive in bytes
   */
  public getCurrentSize(): number {
    return this.currentPosition;
  }

  /**
   * Gets the list of files currently in the archive
   */
  public getFileList(): string[] {
    return Object.keys(this.fileIndex);
  }
}

/**
 * CAF Deserializer - Reads files from CAF archive files
 */
export class CAFDeserializer {
  private archivePath: string;
  private index: CAFIndex | null = null;
  private fileSize: number = 0;

  constructor(archivePath: string) {
    this.archivePath = archivePath;
  }

  /**
   * Loads the CAF index for fast file lookups
   */
  public async loadIndex(): Promise<void> {
    // Get file size
    const stats = await fs.promises.stat(this.archivePath);
    this.fileSize = stats.size;

    // Read footer (last 4 bytes)
    const footerBuffer = Buffer.allocUnsafe(4);
    const fileHandle = await fs.promises.open(this.archivePath, 'r');
    
    try {
      await fileHandle.read(footerBuffer, 0, 4, this.fileSize - 4);
      const indexSize = footerBuffer.readUInt32LE(0);

      // Read index
      const indexBuffer = Buffer.allocUnsafe(indexSize);
      const indexStart = this.fileSize - 4 - indexSize;
      await fileHandle.read(indexBuffer, 0, indexSize, indexStart);

      // Parse index
      const indexJson = indexBuffer.toString('utf8');
      this.index = JSON.parse(indexJson) as CAFIndex;
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * Lists all files in the archive
   */
  public getFileList(): string[] {
    if (!this.index) {
      throw new Error('Index not loaded. Call loadIndex() first.');
    }
    return Object.keys(this.index.files);
  }

  /**
   * Checks if a file exists in the archive
   */
  public hasFile(filePath: string): boolean {
    if (!this.index) {
      throw new Error('Index not loaded. Call loadIndex() first.');
    }
    return filePath in this.index.files;
  }

  /**
   * Extracts a specific file from the archive
   * @param filePath - The path of the file in the archive
   * @returns Promise<Buffer> - The file data
   */
  public async extractFile(filePath: string): Promise<Buffer> {
    if (!this.index) {
      throw new Error('Index not loaded. Call loadIndex() first.');
    }

    const fileMetadata = this.index.files[filePath];
    if (!fileMetadata) {
      throw new Error(`File '${filePath}' not found in archive`);
    }

    const fileSize = fileMetadata.end_byte - fileMetadata.start_byte;
    const buffer = Buffer.allocUnsafe(fileSize);
    
    const fileHandle = await fs.promises.open(this.archivePath, 'r');
    try {
      await fileHandle.read(buffer, 0, fileSize, fileMetadata.start_byte);
      return buffer;
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * Extracts a file and saves it to the filesystem
   * @param filePath - The path of the file in the archive
   * @param outputPath - Where to save the extracted file
   */
  public async extractFileToPath(filePath: string, outputPath: string): Promise<void> {
    const fileData = await this.extractFile(filePath);
    await fs.promises.writeFile(outputPath, fileData);
  }

  /**
   * Extracts all files from the archive to a directory
   * @param outputDir - Directory to extract files to
   */
  public async extractAll(outputDir: string): Promise<void> {
    if (!this.index) {
      throw new Error('Index not loaded. Call loadIndex() first.');
    }

    // Ensure output directory exists
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Extract each file
    for (const filePath of Object.keys(this.index.files)) {
      const outputPath = path.join(outputDir, filePath);
      
      // Ensure subdirectories exist
      const fileDir = path.dirname(outputPath);
      await fs.promises.mkdir(fileDir, { recursive: true });
      
      await this.extractFileToPath(filePath, outputPath);
    }
  }

  /**
   * Gets metadata for a specific file
   */
  public getFileMetadata(filePath: string): CAFFileMetadata | null {
    if (!this.index) {
      throw new Error('Index not loaded. Call loadIndex() first.');
    }
    return this.index.files[filePath] || null;
  }

  /**
   * Gets the CAF format version
   */
  public getFormatVersion(): string {
    if (!this.index) {
      throw new Error('Index not loaded. Call loadIndex() first.');
    }
    return this.index.format_version;
  }
}

/**
 * Utility functions for CAF operations
 */
export class CAFUtils {
  
  /**
   * Validates a CAF archive structure
   * @param archivePath - Path to the CAF archive
   * @returns Promise<boolean> - true if valid
   */
  public static async validateArchive(archivePath: string): Promise<boolean> {
    try {
      const deserializer = new CAFDeserializer(archivePath);
      await deserializer.loadIndex();
      
      // Basic validation - check format version
      const version = deserializer.getFormatVersion();
      return version === "1.0";
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets archive statistics
   * @param archivePath - Path to the CAF archive
   * @returns Promise<object> - Archive statistics
   */
  public static async getArchiveStats(archivePath: string): Promise<{
    totalFiles: number;
    totalSize: number;
    formatVersion: string;
    files: Array<{ path: string; size: number }>;
  }> {
    const deserializer = new CAFDeserializer(archivePath);
    await deserializer.loadIndex();
    
    const fileList = deserializer.getFileList();
    const stats = await fs.promises.stat(archivePath);
    
    const files = fileList.map(filePath => {
      const metadata = deserializer.getFileMetadata(filePath)!;
      return {
        path: filePath,
        size: metadata.end_byte - metadata.start_byte
      };
    });
    
    return {
      totalFiles: fileList.length,
      totalSize: stats.size,
      formatVersion: deserializer.getFormatVersion(),
      files
    };
  }
}

// Example usage (commented out - uncomment to test)
/*
async function example() {
  // Create a CAF archive
  const serializer = new CAFSerializer();
  
  // Add some files
  await serializer.addFile('example.txt', Buffer.from('Hello, World!'));
  await serializer.addFile('data/file.json', Buffer.from(JSON.stringify({ test: true })));
  
  // Finalize the archive
  const archivePath = await serializer.finalize();
  console.log(`Archive created at: ${archivePath}`);
  
  // Read from the archive
  const deserializer = new CAFDeserializer(archivePath);
  await deserializer.loadIndex();
  
  // List files
  console.log('Files in archive:', deserializer.getFileList());
  
  // Extract a file
  const fileData = await deserializer.extractFile('example.txt');
  console.log('Extracted content:', fileData.toString());
  
  // Get archive stats
  const stats = await CAFUtils.getArchiveStats(archivePath);
  console.log('Archive stats:', stats);
}
*/
