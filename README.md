# Rabbit Jackal Integration

A Node.js application that integrates RabbitMQ message queue with Jackal.js storage system for file handling.

## Overview

This project consists of two main components:

1. **RabbitMQ Messaging System**:

   - `send.js`: A message producer that prompts users to input filenames and sends them to a RabbitMQ queue
   - `receive.js`: A message consumer that retrieves filenames from the queue, reads the corresponding files from the local filesystem, and uploads them to Jackal storage

2. **Jackal.js Integration**:
   - TypeScript implementation for interacting with the Jackal decentralized storage network
   - Handles file uploads, directory management, and authentication
   - **NEW**: Database-based configuration - retrieves seedphrase from PostgreSQL database instead of environment variables

## Prerequisites

- Node.js (v14 or higher)
- RabbitMQ server running locally (`amqp://localhost`)
- PostgreSQL database with `jackal_workers` table
- Access to a Jackal storage network (testnet configuration included)

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Build the TypeScript files:
   ```
   npm run build
   ```

### Setting up RabbitMQ with Docker

You can easily set up RabbitMQ using Docker with the following command:

```
docker run -d --name rabbitmq \
    -p 5672:5672 \
    -p 15672:15672 \
    rabbitmq:4.0-management
```

This will:

- Start RabbitMQ in a Docker container
- Expose port 5672 for AMQP connections
- Expose port 15672 for the management UI (accessible at http://localhost:15672)
- Use the RabbitMQ management image which includes the web UI

## Configuration

### Environment Variables

The worker now requires the following environment variables:

#### Required Variables
- `JACKAL_WORKER_ID`: The database ID of the Jackal worker to use
- `DB_HOST`: PostgreSQL database host
- `DB_USER`: PostgreSQL database username
- `DB_PASS`: PostgreSQL database password
- `DB_NAME`: PostgreSQL database name
- `CHAIN_MODE`: Either "mainnet" or "testnet"

#### Optional Variables
- `DB_PORT`: PostgreSQL database port (default: 5432)
- `DB_ROOT_CERT`: Path to SSL root certificate (if using SSL)
- `DB_CERT`: Path to SSL client certificate (if using SSL)
- `DB_KEY`: Path to SSL client key (if using SSL)

### Database Setup

The worker expects a `jackal_workers` table with the following structure:

```sql
CREATE TABLE jackal_workers (
    id SERIAL PRIMARY KEY,
    address VARCHAR(255) NOT NULL,
    seed TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Insert a worker record with your Jackal wallet seedphrase:

```sql
INSERT INTO jackal_workers (address, seed) 
VALUES ('jkl1...', 'your twelve word seedphrase here');
```

## Usage

### Starting the Receiver(Jackal Worker)

To run multiple Jackal workers, you can run multiple instances of the `main.ts` script with different `JACKAL_WORKER_ID` environment variables.

```bash
# Set the worker ID to use
export JACKAL_WORKER_ID=1

# Start the worker
npm start
```

This will:

- Connect to the PostgreSQL database
- Retrieve the seedphrase for the specified worker ID
- Initialize the Jackal client with the database seedphrase
- Connect to RabbitMQ
- Listen for messages on "jackal_save" queue
- Process files and upload them to Jackal storage

### Running with Docker

The worker can be run using Docker Compose with the provided configuration:

```bash
docker-compose up js-worker
```

Make sure to set the `JACKAL_WORKER_ID` environment variable in your `.env` file or environment.

## Architecture Changes

### Before (Environment-based)
- Used `MAINNET_MNEMONIC` environment variable for seedphrase
- Required manual configuration of seedphrase in environment

### After (Database-based)
- Uses `JACKAL_WORKER_ID` to look up worker in database
- Retrieves seedphrase from `jackal_workers.seed` field
- Supports multiple workers with different seedphrases
- More secure and manageable for production deployments
