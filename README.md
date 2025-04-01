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

## Prerequisites

- Node.js (v14 or higher)
- RabbitMQ server running locally (`amqp://localhost`)
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

## Usage

### Starting the Receiver

```
node receive.js
```

This will:

- Initialize the Jackal client
- Connect to RabbitMQ
- Listen for messages on "queue1"
- Process filenames by reading them from `/Users/rodneyshen/Desktop/jkl/dummy_data/` (configure this path for your environment)
- Upload files to Jackal storage at `Home/test/[filename]`

### Sending Messages

```
node send.js
```

This will:

- Connect to RabbitMQ
- Prompt you to enter filenames
- Send each filename to the queue for processing by the receiver

### Configuration

The project uses environment variables for configuration. Check the `.env` file.

## Project Structure

- `send.js` - RabbitMQ producer
- `receive.js` - RabbitMQ consumer that processes messages and calls Jackal functions
- `src/jackal.ts` - TypeScript implementation of Jackal integration
- `src/config.ts` - Configuration for Jackal network
- `jackal.js` - Compiled JavaScript from TypeScript source
- `config.js` - Compiled JavaScript from TypeScript source
- `dist/` - Directory containing compiled TypeScript files

## License

ISC
