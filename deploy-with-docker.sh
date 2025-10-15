#!/bin/bash

# Alternative Deployment - Build Locally with Docker
# Bypasses Cloud Build entirely

set -e

echo "🚀 Vertex AI x Twilio Gateway - Local Docker Deployment"
echo "========================================================="

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo "Install Docker Desktop: https://docs.docker.com/desktop/install/windows-install/"
    exit 1
fi

# Load environment variables
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found${NC}"
    exit 1
fi

export $(cat .env | grep -v '^#' | xargs)

# Configuration
PROJECT_ID="${GOOGLE_CLOUD_PROJECT}"
REGION="${VERTEX_AI_LOCATION:-europe-west2}"
SERVICE_NAME="vertex-twilio-gateway"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/${SERVICE_NAME}"

echo -e "${GREEN}✅ Environment loaded${NC}"
echo ""
echo "📋 Configuration:"
echo "   Project: ${PROJECT_ID}"
echo "   Region: ${REGION}"
echo "   Image: ${IMAGE_NAME}"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

# Step 1: Build Docker image locally
echo -e "${YELLOW}🔨 Building Docker image locally...${NC}"
docker build -t ${IMAGE_NAME} .

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker image built${NC}"
echo ""

# Step 2: Configure Docker authentication
echo -e "${YELLOW}🔐 Authenticating Docker to Artifact Registry...${NC}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Step 3: Push image to Artifact Registry
echo -e "${YELLOW}📤 Pushing image to Artifact Registry...${NC}"
docker push ${IMAGE_NAME}

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to push image${NC}"
    echo "This might be a permission issue with Artifact Registry"
    exit 1
fi

echo -e "${GREEN}✅ Image pushed successfully${NC}"
echo ""

# Step 4: Deploy to Cloud Run from pre-built image
echo -e "${YELLOW}🚀 Deploying to Cloud Run...${NC}"
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID}" \
  --set-env-vars "TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}" \
  --set-env-vars "TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}" \
  --set-env-vars "TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER}" \
  --set-env-vars "VERTEX_AI_LOCATION=${REGION}" \
  --set-env-vars "VERTEX_AI_MODEL=${VERTEX_AI_MODEL:-gemini-2.0-flash-exp}" \
  --set-env-vars "PORT=8080" \
  --set-env-vars "NODE_ENV=production"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --format 'value(status.url)')

echo ""
echo -e "${GREEN}=================================================="
echo "✅ Deployment Successful!"
echo "==================================================${NC}"
echo ""
echo "📍 Service URL: ${SERVICE_URL}"
echo ""
echo -e "${YELLOW}📞 Next Steps:${NC}"
echo "1. Update Twilio webhook to: ${SERVICE_URL}/voice"
echo "2. Test health endpoint: ${SERVICE_URL}/health"
echo "3. Call your number: ${TWILIO_PHONE_NUMBER}"
echo ""
echo -e "${GREEN}Happy calling! 🎉${NC}"