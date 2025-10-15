#!/bin/bash

# Deployment script for Vertex AI x Twilio Gateway
# This script helps deploy the application to Google Cloud Run

set -e  # Exit on any error

echo "🚀 Vertex AI x Twilio Gateway - Deployment Script"
echo "=================================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ Error: gcloud CLI is not installed${NC}"
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "Please copy .env.example to .env and fill in your values"
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Validate required variables
required_vars=("GOOGLE_CLOUD_PROJECT" "TWILIO_ACCOUNT_SID" "TWILIO_AUTH_TOKEN" "TWILIO_PHONE_NUMBER")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}❌ Error: $var is not set in .env${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ Environment variables loaded${NC}"
echo ""

# Confirm project
echo "📋 Deployment Configuration:"
echo "   Project: $GOOGLE_CLOUD_PROJECT"
echo "   Phone: $TWILIO_PHONE_NUMBER"
echo "   Region: ${VERTEX_AI_LOCATION:-us-central1}"
echo ""

read -p "Continue with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

# Set active project
echo -e "${YELLOW}🔧 Setting active GCP project...${NC}"
gcloud config set project $GOOGLE_CLOUD_PROJECT

# Enable required APIs
#echo -e "${YELLOW}🔧 Enabling required APIs...${NC}"
#gcloud services enable run.googleapis.com
#gcloud services enable cloudbuild.googleapis.com
#gcloud services enable aiplatform.googleapis.com

# Create Dockerfile if it doesn't exist
if [ ! -f Dockerfile ]; then
    echo -e "${YELLOW}📝 Creating Dockerfile...${NC}"
    cat > Dockerfile << 'EOF'
FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs/transcripts

# Expose port
EXPOSE 8080

# Start application
CMD ["node", "src/server.js"]
EOF
fi

# Create .dockerignore if it doesn't exist
if [ ! -f .dockerignore ]; then
    echo -e "${YELLOW}📝 Creating .dockerignore...${NC}"
    cat > .dockerignore << 'EOF'
node_modules
npm-debug.log
.env
.env.local
.git
.gitignore
README.md
logs/
*.md
.vscode/
.idea/
EOF
fi

# Build and deploy to Cloud Run
echo -e "${YELLOW}🏗️  Building and deploying to Cloud Run...${NC}"
gcloud run deploy vertex-twilio-gateway \
  --source . \
  --platform managed \
  --region ${VERTEX_AI_LOCATION:-us-central1} \
  --project carpass-ai \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$GOOGLE_CLOUD_PROJECT" \
  --set-env-vars "TWILIO_ACCOUNT_SID=$TWILIO_ACCOUNT_SID" \
  --set-env-vars "TWILIO_AUTH_TOKEN=$TWILIO_AUTH_TOKEN" \
  --set-env-vars "TWILIO_PHONE_NUMBER=$TWILIO_PHONE_NUMBER" \
  --set-env-vars "VERTEX_AI_LOCATION=${VERTEX_AI_LOCATION:-us-central1}" \
  --set-env-vars "VERTEX_AI_LIVE_MODEL=${VERTEX_AI_LIVE_MODEL:-gemini-2.0-flash-exp}" \
  --set-env-vars "NODE_ENV=production"

# Get the deployed URL
SERVICE_URL=$(gcloud run services describe vertex-twilio-gateway \
  --region ${VERTEX_AI_LOCATION:-us-central1} \
  --format 'value(status.url)')

echo ""
echo -e "${GREEN}=================================================="
echo "✅ Deployment Successful!"
echo "==================================================${NC}"
echo ""
echo "📍 Service URL: $SERVICE_URL"
echo ""
echo -e "${YELLOW}📞 Next Steps:${NC}"
echo "1. Update Twilio webhook to: ${SERVICE_URL}/voice"
echo "2. Test health endpoint: ${SERVICE_URL}/health"
echo "3. Call your number: $TWILIO_PHONE_NUMBER"
echo ""
echo -e "${YELLOW}🔗 Quick Links:${NC}"
echo "   Health Check: ${SERVICE_URL}/health"
echo "   Twilio Console: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming"
echo "   Cloud Run Logs: https://console.cloud.google.com/run/detail/${VERTEX_AI_LOCATION:-us-central1}/vertex-twilio-gateway/logs"
echo ""
echo -e "${GREEN}Happy calling! 🎉${NC}"