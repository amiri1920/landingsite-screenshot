# Landingsite Screenshot Tool

An automated screenshot tool specifically optimized for capturing full-page screenshots of landingsite.ai website previews.

## Features

- **Specialized for landingsite.ai**: Optimized specifically for capturing landingsite.ai website previews
- **Reliable Capture**: Uses proven techniques to capture full-page screenshots
- **Batch Processing**: Process multiple website preview IDs in parallel
- **Automatic Retries**: Automatically retry failed screenshots
- **CLI Interface**: Easy-to-use command-line interface
- **API Server**: RESTful API for integration with other systems
- **Detailed Reporting**: Generate detailed reports of processing results

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```

## Usage

### Command Line Interface (CLI)

#### Capture a single screenshot:

```bash
npm run capture 884975a2-5820-48d4-b415-0f038208bcbe -- --output ./my-screenshot.png
```

Or directly:

```bash
node cli.js capture 884975a2-5820-48d4-b415-0f038208bcbe --output ./my-screenshot.png
```

#### Process multiple IDs from a file:

Create a text file with one ID per line:

```
884975a2-5820-48d4-b415-0f038208bcbe
1234567890abcdef
```

Then run:

```bash
npm run batch -- ids.txt --output-dir ./batch-output --concurrency 2
```

Or directly:

```bash
node cli.js batch ids.txt --output-dir ./batch-output --concurrency 2
```

### API Server

Start the API server:

```bash
npm start
```

#### Capture a single screenshot:

```bash
curl -X POST http://localhost:3000/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{"id":"884975a2-5820-48d4-b415-0f038208bcbe"}'
```

#### Process multiple IDs:

```bash
curl -X POST http://localhost:3000/api/batch \
  -H "Content-Type: application/json" \
  -d '{"ids":["884975a2-5820-48d4-b415-0f038208bcbe","1234567890abcdef"]}'
```

#### Check batch status:

```bash
curl http://localhost:3000/api/batch/1234567890/status
```

## Options

### CLI Options

#### For `capture` command:

- `--output, -o <path>`: Output file path (default: ./screenshot.png)
- `--headless <true|false|new>`: Run in headless mode (default: new)
- `--timeout <ms>`: Timeout in milliseconds (default: 300000)

#### For `batch` command:

- `--output-dir, -o <path>`: Output directory (default: ./screenshots)
- `--concurrency, -c <number>`: Number of concurrent screenshots (default: 1)
- `--retries, -r <number>`: Number of retry attempts (default: 3)
- `--headless <true|false|new>`: Run in headless mode (default: new)
- `--timeout <ms>`: Timeout in milliseconds (default: 300000)

### API Options

#### For `/api/screenshot` endpoint:

```json
{
  "id": "884975a2-5820-48d4-b415-0f038208bcbe",
  "headless": "new",
  "timeout": 300000
}
```

#### For `/api/batch` endpoint:

```json
{
  "ids": ["884975a2-5820-48d4-b415-0f038208bcbe", "1234567890abcdef"],
  "concurrency": 2,
  "retries": 3
}
```

## Requirements

- Node.js 14+
- Google Chrome installed on the system

## License

ISC