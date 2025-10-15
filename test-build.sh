#!/bin/bash

# Test build script for local Docker testing
echo "🧪 Testing Docker build locally..."

# Test if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop."
    exit 1
fi

# Test the build
echo "🏗️ Building Docker image..."
if docker build -t vertex-twilio-test .; then
    echo "✅ Docker build successful!"
    echo "🧪 Testing the container..."
    
    # Test run the container
    if docker run --rm -p 8080:8080 -e NODE_ENV=test vertex-twilio-test node -e "console.log('✅ Container test successful!')"; then
        echo "✅ Container test successful!"
        echo "🚀 Ready for deployment!"
    else
        echo "❌ Container test failed"
        exit 1
    fi
else
    echo "❌ Docker build failed"
    echo "💡 Check the error messages above"
    exit 1
fi