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
    
    // Ensure the write stream was created successfully
    if (!this.writeStream) {
      throw new Error('Failed to create write stream');
    }
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
   * Adds a file to the CAF archive from a stream
   * @param filePath - The path/name to store the file as in the archive
   * @param stream - The readable stream containing file data
   * @param contentLength - The size of the file in bytes
   * @returns Promise<boolean> - true if file was added, false if it would exceed chunk size
   */
  public async addFileFromStream(filePath: string, stream: NodeJS.ReadableStream, contentLength: number): Promise<boolean> {
    console.log(`CAF: Starting to add file stream: ${filePath} (${contentLength} bytes)`)
    console.log(`CAF: Current position: ${this.currentPosition}, Max size: ${this.maxChunkSize}`)
    
    // Check if adding this file would exceed the chunk size limit
    if (this.currentPosition + contentLength > this.maxChunkSize) {
      console.log(`CAF: File ${filePath} would exceed size limit (${this.currentPosition + contentLength} > ${this.maxChunkSize})`)
      return false;
    }

    const startByte = this.currentPosition;
    console.log(`CAF: Adding file ${filePath} at position ${startByte}`)
    
    return new Promise<boolean>((resolve, reject) => {
      let bytesReceived = 0;
      const startTime = Date.now();
      let isResolved = false;

      // Cleanup function to remove event listeners and destroy stream
      let cleanup = () => {
        if (isResolved) return;
        isResolved = true;
        
        // Remove all event listeners
        stream.removeAllListeners('error');
        stream.removeAllListeners('data');
        stream.removeAllListeners('end');
        
        // Destroy the stream to free memory
        if ('destroy' in stream && typeof (stream as any).destroy === 'function') {
          (stream as any).destroy();
        }
      };

      stream.on('error', (error) => {
        console.error(`CAF: Stream error for ${filePath}:`, error);
        cleanup();
        reject(error);
      });

      let lastProgressUpdate = Date.now();
      const progressInterval = 5000; // 5 seconds
      
      stream.on('data', (chunk) => {
        bytesReceived += chunk.length;
        const now = Date.now();
        
        // Only log progress every 5 seconds
        if (now - lastProgressUpdate >= progressInterval) {
          const progress = ((bytesReceived / contentLength) * 100).toFixed(1);
          console.log(`CAF: Streaming ${filePath}: ${bytesReceived}/${contentLength} bytes (${progress}%)`);
          lastProgressUpdate = now;
        }
        
        // Check if writeStream is still healthy
        if (this.writeStream.destroyed) {
          console.error(`CAF: WriteStream destroyed during data transfer for ${filePath}`);
          cleanup();
          reject(new Error('WriteStream was destroyed during transfer'));
          return;
        }
      });

      stream.on('end', () => {
        const endByte = this.currentPosition + contentLength;
        const duration = Date.now() - startTime;
        const throughput = (contentLength / 1024 / 1024) / (duration / 1000); // MB/s
        
        console.log(`CAF: Finished streaming ${filePath} in ${duration}ms (${throughput.toFixed(2)} MB/s)`);
        console.log(`CAF: File added to index: ${startByte} to ${endByte}`);
        
        // Add to index
        this.fileIndex[filePath] = {
          start_byte: startByte,
          end_byte: endByte
        };

        this.currentPosition = endByte;
        console.log(`CAF: New position: ${this.currentPosition}`);
        
        cleanup();
        resolve(true);
      });

      // Set up timeout protection
      const timeoutMs = 300000; // 5 minutes timeout
      const timeoutId = setTimeout(() => {
        console.error(`CAF: Timeout after ${timeoutMs}ms for ${filePath}`);
        cleanup();
        reject(new Error(`Stream timeout after ${timeoutMs}ms for ${filePath}`));
      }, timeoutMs);

      // Clear timeout on completion
      const originalCleanup = cleanup;
      cleanup = () => {
        clearTimeout(timeoutId);
        originalCleanup();
      };

      // Handle writeStream errors
      const onWriteStreamError = (error: Error) => {
        console.error(`CAF: WriteStream error for ${filePath}:`, error);
        cleanup();
        reject(error);
      };

      // Pipe the stream directly to the CAF write stream
      console.log(`CAF: Starting pipe for ${filePath}`);
      if (this.writeStream && !this.writeStream.destroyed) {
        // Add error handler to writeStream
        this.writeStream.once('error', onWriteStreamError);
        
        // Handle pipe completion and errors
        stream.pipe(this.writeStream, { end: false });
        console.log(`CAF: Pipe established for ${filePath}, waiting for data...`);
        
        // Clean up writeStream error handler when done
        stream.once('end', () => {
          this.writeStream.removeListener('error', onWriteStreamError);
        });
        
        stream.once('error', () => {
          this.writeStream.removeListener('error', onWriteStreamError);
        });
      } else {
        cleanup();
        reject(new Error('Write stream has been destroyed'));
        return;
      }
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
   * Cleanup method to free resources
   */
  public cleanup(): void {
    if (this.writeStream && !this.writeStream.destroyed) {
      this.writeStream.end();
      this.writeStream.destroy();
    }
    // Clear the file index to free memory
    this.fileIndex = {};
  }

  /**
   * Finalizes the CAF archive by writing the index and footer
   */
  public async finalize(): Promise<string> {
    console.log(`CAF: Starting finalization of ${this.outputPath}`)
    console.log(`CAF: Final size: ${this.currentPosition} bytes`)
    console.log(`CAF: Total files: ${Object.keys(this.fileIndex).length}`)
    
    return new Promise<string>((resolve, reject) => {
      // Create the index
      const index: CAFIndex = {
        format_version: "1.0",
        files: this.fileIndex
      };

      const indexJson = JSON.stringify(index);
      const indexBuffer = Buffer.from(indexJson, 'utf8');
      const indexSize = indexBuffer.length;
      
      console.log(`CAF: Index size: ${indexSize} bytes`);

      // Check if stream is still valid
      if (!this.writeStream || this.writeStream.destroyed) {
        reject(new Error('Write stream has been destroyed'));
        return;
      }
      
      // Write index
      this.writeStream.write(indexBuffer, (error) => {
        if (error) {
          reject(error);
          return;
        }

        // Check if stream is still valid before writing footer
        if (!this.writeStream || this.writeStream.destroyed) {
          reject(new Error('Write stream has been destroyed'));
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
            console.log(`CAF: Successfully finalized ${this.outputPath}`)
            console.log(`CAF: Final archive size: ${this.currentPosition + indexSize + 4} bytes`)
            
            // Clean up the stream after finalization is complete
            if (this.writeStream && !this.writeStream.destroyed) {
              this.writeStream.destroy();
            }
            
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

  /**
   * Gets the current size limit in bytes
   */
  public getMaxSize(): number {
    return this.maxChunkSize;
  }

  /**
   * Gets the current size limit in GB
   */
  public getMaxSizeGB(): number {
    return this.maxChunkSize / (1024 * 1024 * 1024);
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
