#!/bin/bash

# GitHub Release Script for AQSTR Mobile
# Usage: ./release-to-github.sh <release-notes> [apk-path]
# Version is automatically read from package.json

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if required arguments are provided
if [ $# -lt 1 ]; then
    echo -e "${RED}Error: Missing required arguments${NC}"
    echo "Usage: $0 <release-notes> [apk-path]"
    echo ""
    echo "Examples:"
    echo "  $0 \"Initial release\" ./builds/app-release.apk"
    echo "  $0 \"Bug fixes and improvements\"  # Will search for APK"
    exit 1
fi

# Auto-read version from package.json
VERSION="v$(node -p "require('./package.json').version")"
RELEASE_NOTES=$1
APK_PATH=${2:-""}

echo -e "${GREEN}Detected version from package.json: ${VERSION}${NC}"

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
    echo "Install it from: https://cli.github.com/"
    echo ""
    echo "macOS: brew install gh"
    echo "Linux: See https://cli.github.com/manual/installation"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${RED}Error: Not authenticated with GitHub CLI${NC}"
    echo "Run: gh auth login"
    exit 1
fi

# Find APK file if not provided
if [ -z "$APK_PATH" ]; then
    echo -e "${YELLOW}APK path not provided. Searching for APK files...${NC}"
    
    # Check common locations
    if [ -f "./builds/*.apk" ]; then
        APK_PATH=$(ls -t ./builds/*.apk 2>/dev/null | head -1)
    elif [ -f "./android/app/build/outputs/apk/release/app-release.apk" ]; then
        APK_PATH="./android/app/build/outputs/apk/release/app-release.apk"
    else
        echo -e "${RED}Error: APK file not found${NC}"
        echo "Please provide the path to the APK file:"
        echo "  $0 $VERSION \"$RELEASE_NOTES\" <path-to-apk>"
        exit 1
    fi
fi

# Validate APK file exists
if [ ! -f "$APK_PATH" ]; then
    echo -e "${RED}Error: APK file not found at: $APK_PATH${NC}"
    exit 1
fi

# Get APK filename for release asset
APK_FILENAME=$(basename "$APK_PATH")
RELEASE_APK_NAME="aqstr-mobile-${VERSION}.apk"

# Copy APK with release name
cp "$APK_PATH" "/tmp/$RELEASE_APK_NAME"

echo -e "${GREEN}Creating GitHub release...${NC}"
echo "  Version: $VERSION"
echo "  APK: $APK_PATH"
echo "  Release notes: $RELEASE_NOTES"
echo ""

# Create the release
gh release create "$VERSION" \
    "/tmp/$RELEASE_APK_NAME" \
    --title "$VERSION" \
    --notes "$RELEASE_NOTES"

# Clean up
rm -f "/tmp/$RELEASE_APK_NAME"

echo -e "${GREEN}✓ Release created successfully!${NC}"
echo ""
echo "View release at:"
gh release view "$VERSION" --web

