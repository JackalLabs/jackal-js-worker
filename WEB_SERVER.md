# JS Worker Web Server

The JS Worker now includes an Express web server that provides HTTP endpoints for retrieving files from CAF bundles stored in Jackal.

## Endpoints

### Health Check
- **GET** `/health`
- Returns server status and worker information

### File Retrieval
- **GET** `/file/:taskId/:filePath`
- Downloads and returns a specific file from a CAF bundle
- Parameters:
  - `taskId`: The task ID associated with the file
  - `filePath`: The path of the file within the CAF bundle
- Returns: The file content as a download

### File Information
- **GET** `/file-info/:taskId/:filePath`
- Returns metadata about a file without downloading it
- Parameters:
  - `taskId`: The task ID associated with the file
  - `filePath`: The path of the file within the CAF bundle
- Returns: JSON with file metadata

## Configuration

The web server port is automatically calculated based on the worker ID:

- Port = `6700 + JACKAL_WORKER_ID`
- Worker ID 1 → Port 6701
- Worker ID 2 → Port 6702
- etc.

## Example Usage

```bash
# Health check (for worker ID 1)
curl http://localhost:6701/health

# Get file info
curl http://localhost:6701/file-info/task123/path/to/file.txt

# Download file
curl -O http://localhost:6701/file/task123/path/to/file.txt
```

## How It Works

1. When a request comes in, the server looks up the file in the database using `taskId` and `filePath`
2. It retrieves the `bundle_id` (CAF filename) from the database
3. Downloads the CAF bundle from Jackal storage
4. Extracts the specific file from the CAF archive
5. Returns the file content to the client
6. Cleans up temporary files

## Security Features

- Input validation for taskId and filePath parameters
- Protection against path traversal attacks
- Timeout protection for download operations
- Proper error handling and cleanup

## Database Schema

The web server relies on the `jackal_files` table with the following structure:

```sql
CREATE TABLE jackal_files (
  id SERIAL PRIMARY KEY,
  file_path VARCHAR NOT NULL,
  task_id VARCHAR NOT NULL,
  bundle_id VARCHAR NOT NULL,
  js_worker_id VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```
