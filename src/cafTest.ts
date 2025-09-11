// Import logger first to replace console.log globally
// import './logger'

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CAFSerializer, CAFDeserializer, CAFUtils } from './cafSerializer';

/**
 * Comprehensive test suite for CAF Serializer/Deserializer
 * Tests random file ordering and validates integrity using MD5 checksums
 */

interface TestFile {
  relativePath: string;
  fullPath: string;
  size: number;
  md5: string;
}

export class CAFTester {
  private testDir: string;
  private tempArchivePath: string | null = null;

  constructor(testDirectory: string = 'test-files') {
    this.testDir = path.resolve(testDirectory);
  }

  /**
   * Calculates MD5 hash of a file
   */
  private async calculateMD5(filePath: string): Promise<string> {
    const fileBuffer = await fs.promises.readFile(filePath);
    return crypto.createHash('md5').update(fileBuffer).digest('hex');
  }

  /**
   * Calculates MD5 hash of a buffer
   */
  private calculateMD5FromBuffer(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Discovers all files in the test directory (flat structure only)
   */
  private async discoverFiles(): Promise<TestFile[]> {
    const files: TestFile[] = [];
    const entries = await fs.promises.readdir(this.testDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const fullPath = path.join(this.testDir, entry.name);
        const stats = await fs.promises.stat(fullPath);
        const md5 = await this.calculateMD5(fullPath);
        
        files.push({
          relativePath: entry.name,
          fullPath,
          size: stats.size,
          md5
        });
      }
    }

    return files;
  }

  /**
   * Shuffles array using Fisher-Yates algorithm
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Creates a CAF archive with files in random order
   */
  public async createRandomizedArchive(): Promise<{
    archivePath: string;
    originalFiles: TestFile[];
  }> {
    console.log('🔍 Discovering test files...');
    const originalFiles = await this.discoverFiles();
    
    if (originalFiles.length === 0) {
      throw new Error(`No files found in test directory: ${this.testDir}`);
    }

    console.log(`📁 Found ${originalFiles.length} files to archive`);
    originalFiles.forEach(file => {
      console.log(`   • ${file.relativePath} (${file.size} bytes, MD5: ${file.md5})`);
    });

    // Shuffle the files randomly
    const shuffledFiles = this.shuffleArray(originalFiles);

    console.log('\n🔀 Randomized file order:');
    shuffledFiles.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file.relativePath}`);
    });

    // Create CAF archive
    console.log('\n📦 Creating CAF archive...');
    const serializer = new CAFSerializer();

    for (const file of shuffledFiles) {
      console.log(`   Adding: ${file.relativePath}`);
      const success = await serializer.addFileFromPath(file.relativePath, file.fullPath);
      if (!success) {
        throw new Error(`Failed to add file ${file.relativePath} - would exceed chunk size`);
      }
    }

    const archivePath = await serializer.finalize();
    this.tempArchivePath = archivePath;

    console.log(`✅ Archive created: ${archivePath}`);
    console.log(`📊 Archive size: ${(await fs.promises.stat(archivePath)).size} bytes`);

    return {
      archivePath,
      originalFiles,
    };
  }

  /**
   * Validates the archive by extracting all files and comparing MD5 hashes
   */
  public async validateArchive(archivePath: string, originalFiles: TestFile[]): Promise<{
    success: boolean;
    results: Array<{
      file: string;
      originalMD5: string;
      extractedMD5: string;
      sizeMatch: boolean;
      md5Match: boolean;
      error?: string;
    }>;
    summary: {
      totalFiles: number;
      passedFiles: number;
      failedFiles: number;
      totalSizeOriginal: number;
      totalSizeExtracted: number;
    };
  }> {
    console.log('\n🔍 Validating archive integrity...');
    
    const deserializer = new CAFDeserializer(archivePath);
    await deserializer.loadIndex();

    const results: any[] = [];
    let totalSizeOriginal = 0;
    let totalSizeExtracted = 0;
    let passedFiles = 0;
    let failedFiles = 0;

    // Create original files lookup
    const originalFilesMap = new Map<string, TestFile>();
    originalFiles.forEach(file => {
      originalFilesMap.set(file.relativePath, file);
      totalSizeOriginal += file.size;
    });

    // Get files from archive
    const archivedFiles = deserializer.getFileList();
    console.log(`📋 Archive contains ${archivedFiles.length} files`);

    // Check each file
    for (const filePath of archivedFiles) {
      console.log(`   Checking: ${filePath}`);
      
      try {
        const originalFile = originalFilesMap.get(filePath);
        if (!originalFile) {
          results.push({
            file: filePath,
            originalMD5: 'N/A',
            extractedMD5: 'N/A',
            sizeMatch: false,
            md5Match: false,
            error: 'File not found in original files'
          });
          failedFiles++;
          continue;
        }

        // Extract file from archive
        const extractedBuffer = await deserializer.extractFile(filePath);
        const extractedMD5 = this.calculateMD5FromBuffer(extractedBuffer);
        
        totalSizeExtracted += extractedBuffer.length;
        
        const sizeMatch = extractedBuffer.length === originalFile.size;
        const md5Match = extractedMD5 === originalFile.md5;

        results.push({
          file: filePath,
          originalMD5: originalFile.md5,
          extractedMD5,
          sizeMatch,
          md5Match,
        });

        if (sizeMatch && md5Match) {
          passedFiles++;
          console.log(`     ✅ PASS - Size: ${extractedBuffer.length}, MD5: ${extractedMD5}`);
        } else {
          failedFiles++;
          console.log(`     ❌ FAIL - Size: ${extractedBuffer.length}/${originalFile.size}, MD5: ${extractedMD5}/${originalFile.md5}`);
        }

      } catch (error) {
        results.push({
          file: filePath,
          originalMD5: originalFilesMap.get(filePath)?.md5 || 'N/A',
          extractedMD5: 'N/A',
          sizeMatch: false,
          md5Match: false,
          error: error instanceof Error ? error.message : String(error)
        });
        failedFiles++;
        console.log(`     ❌ ERROR - ${error}`);
      }
    }

    // Check for missing files
    for (const originalFile of originalFiles) {
      if (!archivedFiles.includes(originalFile.relativePath)) {
        results.push({
          file: originalFile.relativePath,
          originalMD5: originalFile.md5,
          extractedMD5: 'N/A',
          sizeMatch: false,
          md5Match: false,
          error: 'File missing from archive'
        });
        failedFiles++;
      }
    }

    const success = failedFiles === 0;
    
    return {
      success,
      results,
      summary: {
        totalFiles: originalFiles.length,
        passedFiles,
        failedFiles,
        totalSizeOriginal,
        totalSizeExtracted
      }
    };
  }

  /**
   * Tests extraction to filesystem and validates (using original file order to ensure random access works)
   */
  public async testExtractionToFilesystem(archivePath: string, originalFiles: TestFile[]): Promise<boolean> {
    console.log('\n📂 Testing extraction to filesystem...');
    console.log('   Using original discovery order (not archive order) to test random access...');
    
    const tempExtractDir = path.join(process.cwd(), 'temp-extract-test');
    
    try {
      // Clean up any existing temp directory
      if (fs.existsSync(tempExtractDir)) {
        await fs.promises.rm(tempExtractDir, { recursive: true });
      }

      const deserializer = new CAFDeserializer(archivePath);
      await deserializer.loadIndex();

      // Extract all files using extractAll() method first
      await deserializer.extractAll(tempExtractDir);
      console.log(`   Bulk extracted all files to: ${tempExtractDir}`);

      // Now validate by extracting files individually in ORIGINAL ORDER (not archive order)
      // This tests that we can extract files in any order, not just the order they were stored
      console.log('   Testing individual extraction in original discovery order:');
      let allValid = true;

      for (const originalFile of originalFiles) {
        const extractedPath = path.join(tempExtractDir, originalFile.relativePath);
        
        console.log(`   Checking: ${originalFile.relativePath}`);
        
        if (!fs.existsSync(extractedPath)) {
          console.log(`     ❌ Extracted file missing: ${extractedPath}`);
          allValid = false;
          continue;
        }

        // Extract this specific file directly from archive (in original order)
        const archiveBuffer = await deserializer.extractFile(originalFile.relativePath);
        const extractedBuffer = await fs.promises.readFile(extractedPath);
        
        // Validate byte-for-byte content match
        const contentMatch = archiveBuffer.equals(extractedBuffer);
        
        // Validate MD5 hash match
        const extractedMD5 = this.calculateMD5FromBuffer(extractedBuffer);
        const archiveMD5 = this.calculateMD5FromBuffer(archiveBuffer);
        const originalMD5 = originalFile.md5;
        const md5Match = extractedMD5 === archiveMD5 && archiveMD5 === originalMD5;
        
        if (!contentMatch || !md5Match) {
          console.log(`     ❌ Validation failed: ${originalFile.relativePath}`);
          if (!contentMatch) console.log(`       • Content mismatch (byte comparison)`);
          if (!md5Match) console.log(`       • MD5 mismatch: original=${originalMD5}, archive=${archiveMD5}, extracted=${extractedMD5}`);
          allValid = false;
        } else {
          console.log(`     ✅ Valid extraction: ${originalFile.relativePath} (content + MD5 verified)`);
        }
      }

      return allValid;

    } finally {
      // Clean up temp directory
      if (fs.existsSync(tempExtractDir)) {
        await fs.promises.rm(tempExtractDir, { recursive: true });
        console.log(`   🧹 Cleaned up temp directory: ${tempExtractDir}`);
      }
    }
  }

  /**
   * Runs the complete test suite
   */
  public async runCompleteTest(): Promise<void> {
    console.log('🧪 Starting CAF Test Suite');
    console.log('=' .repeat(50));

    try {
      // 1. Create randomized archive
      const { archivePath, originalFiles } = await this.createRandomizedArchive();

      // 2. Validate archive structure
      console.log('\n🔧 Validating archive structure...');
      const isValid = await CAFUtils.validateArchive(archivePath);
      console.log(`   Archive structure valid: ${isValid ? '✅' : '❌'}`);

      // 3. Get archive statistics
      const stats = await CAFUtils.getArchiveStats(archivePath);
      console.log('\n📊 Archive Statistics:');
      console.log(`   Format Version: ${stats.formatVersion}`);
      console.log(`   Total Files: ${stats.totalFiles}`);
      console.log(`   Archive Size: ${stats.totalSize} bytes`);
      console.log(`   Average File Size: ${Math.round(stats.files.reduce((sum, f) => sum + f.size, 0) / stats.files.length)} bytes`);

      // 4. Validate file integrity
      const validation = await this.validateArchive(archivePath, originalFiles);

      // 5. Test filesystem extraction
      const extractionValid = await this.testExtractionToFilesystem(archivePath, originalFiles);

      // 6. Print final results
      console.log('\n🏁 Final Test Results');
      console.log('=' .repeat(50));
      console.log(`Archive Structure: ${isValid ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`File Integrity: ${validation.success ? '✅ PASS' : '❌ FAIL'} (${validation.summary.passedFiles}/${validation.summary.totalFiles})`);
      console.log(`Filesystem Extraction: ${extractionValid ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`Total Size Verification: ${validation.summary.totalSizeOriginal === validation.summary.totalSizeExtracted ? '✅ PASS' : '❌ FAIL'}`);

      if (!validation.success) {
        console.log('\n❌ Failed Files:');
        validation.results.filter(r => !r.md5Match || !r.sizeMatch || r.error).forEach(result => {
          console.log(`   • ${result.file}: ${result.error || `MD5: ${result.md5Match ? 'OK' : 'FAIL'}, Size: ${result.sizeMatch ? 'OK' : 'FAIL'}`}`);
        });
      }

      const overallSuccess = isValid && validation.success && extractionValid;
      console.log(`\n🎯 Overall Result: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

    } catch (error) {
      console.error('\n💥 Test suite failed with error:', error);
      throw error;
    } finally {
      // Clean up temp archive
      if (this.tempArchivePath && fs.existsSync(this.tempArchivePath)) {
        await fs.promises.unlink(this.tempArchivePath);
        console.log(`\n🧹 Cleaned up temp archive: ${this.tempArchivePath}`);
      }
    }
  }

  /**
   * Quick test method for simple validation
   */
  public async quickTest(): Promise<boolean> {
    try {
      const { archivePath, originalFiles } = await this.createRandomizedArchive();
      const validation = await this.validateArchive(archivePath, originalFiles);
      
      if (this.tempArchivePath && fs.existsSync(this.tempArchivePath)) {
        await fs.promises.unlink(this.tempArchivePath);
      }
      
      return validation.success;
    } catch (error) {
      console.error('Quick test failed:', error);
      return false;
    }
  }
}

// Example usage and standalone test runner
if (require.main === module) {
  async function main() {
    const tester = new CAFTester('./test-files');
    
    try {
      await tester.runCompleteTest();
    } catch (error) {
      console.error('Test execution failed:', error);
      process.exit(1);
    }
  }

  main();
}
