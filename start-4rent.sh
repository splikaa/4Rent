#!/usr/bin/env bash
set -e
echo "=========================================================="
echo "  4Rent v1.1.0 — Apartment & Sub-Meter Management System"
echo "  Starting macOS / Linux Local Network Server..."
echo "=========================================================="
if [ ! -d "node_modules" ]; then
  npm install
fi
npm run dev
