#!/bin/bash

# AQSTR Mobile Android Build Script
# Usage:
#   ./build-android.sh --profile production          # Cloud build (appears in EAS dashboard)
#   ./build-android.sh --local --profile production  # Local build (saves to builds/)
#   ./build-android.sh --local --profile development # Local dev build

# Set Android SDK location
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools

# Extract profile from arguments (default to "development")
PROFILE="development"
for arg in "$@"; do
    if [[ "$arg" == "--profile" ]]; then
        PROFILE_NEXT=true
    elif [[ "$PROFILE_NEXT" == true ]]; then
        PROFILE="$arg"
        PROFILE_NEXT=false
    fi
done

# Auto-bump version for production builds
if [[ "$PROFILE" == "production" ]]; then
    echo "📦 Auto-bumping patch version for production build..."
    OLD_VERSION=$(node -p "require('./package.json').version")
    npm version patch --no-git-tag-version > /dev/null 2>&1
    NEW_VERSION=$(node -p "require('./package.json').version")
    echo "   Version: ${OLD_VERSION} → ${NEW_VERSION}"
    echo ""
fi

# Generate timestamp for unique filenames
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
VERSION=$(node -p "require('./package.json').version")
OUTPUT_FILENAME="aqstr-v${VERSION}-${PROFILE}.apk"

# Check if --local flag is provided, otherwise do cloud build
if [[ "$*" == *"--local"* ]]; then
    # Create builds directory if it doesn't exist
    mkdir -p builds
    
    echo "🔨 Building ${PROFILE} APK locally..."
    echo "📁 Output: builds/${OUTPUT_FILENAME}"
    echo ""
    
    # Run EAS build locally (won't appear in EAS dashboard)
    npx eas-cli build --platform android --local --output "./builds/${OUTPUT_FILENAME}" "$@"
    
    # Show build artifact locations
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Build completed successfully!"
        echo ""
        echo "📦 Build artifact location:"
        echo "   $(pwd)/builds/${OUTPUT_FILENAME}"
        echo ""
        echo "💡 To create a GitHub release:"
        echo "   ./release-to-github.sh \"Release notes\" ./builds/${OUTPUT_FILENAME}"
    fi
else
    # Run EAS build in cloud (will appear in EAS dashboard)
    echo "☁️  Building ${PROFILE} APK in EAS cloud..."
    echo ""
    
    npx eas-cli build --platform android "$@"
    
    # Show next steps for cloud builds
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Build submitted to EAS!"
        echo ""
        echo "📦 Next steps:"
        echo "   1. Download APK from EAS dashboard:"
        echo "      https://expo.dev/accounts/[your-account]/projects/aqstr-mobile/builds"
        echo "   2. Create GitHub release:"
        echo "      ./release-to-github.sh \"Release notes\" <path-to-downloaded-apk>"
    fi
fi

