# Landingsite Screenshot Service

A Node.js application that captures full-page screenshots of landingsite.ai website previews using Puppeteer and Chrome. The service is deployed on Render.com and provides a REST API for screenshot requests, including an n8n integration endpoint.

## Key Features

- Captures full-page screenshots of landingsite.ai website previews
- Optimized for specific template heights (8295px and 6565px)
- Memory-efficient implementation for cloud environments
- REST API for screenshot requests
- Specialized n8n integration endpoint
- Batch processing capabilities

## Memory Optimization

This service is optimized to run within memory constraints by:

1. Using memory-efficient browser settings
2. Limiting JavaScript heap size to 512MB
3. Implementing proper resource cleanup
4. Using a single browser process
5. Optimizing viewport dimensions
6. Disabling unnecessary features

## API Endpoints

- `GET /` - Health check endpoint
- `POST /api/screenshot` - Capture a single screenshot
- `POST /api/n8n/screenshot` - Capture a screenshot (optimized for n8n)
- `POST /api/batch` - Process multiple IDs in batch
- `GET /api/batch/:batchId/status` - Check batch status

## Using with n8n

The service can be integrated with n8n using the HTTP Request node:

```json
{
  "endpoint": "https://landingsite-screenshot.onrender.com/api/n8n/screenshot",
  "method": "POST",
  "body": {
    "id": "your-website-id",
    "templateHeight": 8295
  }
}
```

## Deployment on Render.com

The service is configured to deploy on Render.com with:

- Docker container environment
- 512MB memory limit
- 10GB persistent disk for storing screenshots

## Troubleshooting

If you encounter a 502 Bad Gateway error, it may be due to:

1. Memory limits being exceeded - the service is optimized to work within memory constraints, but large websites may still cause issues
2. Timeout issues - the default timeout is 5 minutes, which should be sufficient for most websites
3. Connection issues - check if landingsite.ai is accessible

For persistent issues, check the logs on Render.com for more details.