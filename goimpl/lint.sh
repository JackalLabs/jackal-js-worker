#!/bin/bash

# Simple Go linting script
# Runs gofumpt for formatting and golangci-lint for linting

set -e

echo "🔧 Running Go linting and formatting..."

# Check if gofumpt is installed
if ! command -v gofumpt &> /dev/null; then
    echo "❌ gofumpt is not installed. Installing..."
    go install mvdan.cc/gofumpt@latest
fi

# Check if golangci-lint is installed
if ! command -v golangci-lint &> /dev/null; then
    echo "❌ golangci-lint is not installed. Installing..."
    go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
fi

echo ""
echo "📝 Running gofumpt (formatting)..."
gofumpt -l -w .

echo ""
echo "🔍 Running golangci-lint..."
golangci-lint run

echo ""
echo "✅ Linting complete!"
