#!/usr/bin/env bash
set -e
echo "=========================================================="
echo "  4Rent Management System v1.0.0"
echo "  Starting macOS / Linux Local Network Server..."
echo "=========================================================="
if [ ! -d "node_modules" ]; then
  npm install
fi
npm run dev
