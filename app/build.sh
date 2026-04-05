#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/JerryMate.app"

echo "Building JerryMate..."
cd "$SCRIPT_DIR/JerryMate"
swift build -c release

echo "Copying binary to app bundle..."
cp .build/release/JerryMate "$APP_DIR/Contents/MacOS/JerryMate"

echo "Done! App is at: $APP_DIR"
echo "To install: cp -r $APP_DIR /Applications/"
echo "To run: open /Applications/JerryMate.app"
