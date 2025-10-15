# Vertex AI × Twilio Voice Integration

AI-powered phone assistant for Carpass Motors using Google Vertex AI Live API and Twilio Voice.

**Phone:** +1 334 888 8892

---

## 🎯 Features

- ✅ Real-time two-way voice conversations
- ✅ Natural language understanding via Vertex AI
- ✅ Low-latency responses (< 0.5s target)
- ✅ Automatic call transcription
- ✅ Call logging and summaries
- ✅ Barge-in support (interrupt AI)

---

## 📋 Prerequisites

Before starting, ensure you have:

1. **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
2. **Google Cloud Account** with Vertex AI enabled
3. **Twilio Account** with a phone number
4. **Git** installed

---

## 🚀 Quick Start

### Step 1: Clone the Repository

```bash
git clone https://github.com/engineer-carpass/vetex-ai-integration.git
cd vetex-ai-integration
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Google Cloud

1. **Enable Vertex AI API:**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Search for "Vertex AI API" and click "Enable"

2. **Create Service Account:**
   - Navigate to: IAM & Admin → Service Accounts
   - Click "Create Service Account"
   - Name: `vertex-ai-caller`
   - Grant role: "Vertex AI User"
   - Click "Create and Continue"
   - Click "Done"

3. **Download Credentials:**
   - Click on your new service account
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key"
   - Choose "JSON" format
   - Save the file as `config/vertex-credentials.json`

### Step 4: Configure Environment Variables

```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your values
nano .env  # or use your preferred editor
```

**Fill in these values:**

```bash
# Your Google Cloud Project ID (find in GCP Console)
GOOGLE_CLOUD_PROJECT=your-project-id

# Twilio credentials (find in Twilio Console)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+13348888892

# Server port (use 3000 for local, or your deployment port)
PORT=3000
```

### Step 5: Test Locally

```bash
# Start the server
npm start

# You should see:
# 🚗 Carpass Motors AI Assistant - Gateway Server
# 🌐 Server running on port: 3000
# 📞 Phone number: +1 334 888 8892
# Ready to accept calls! 🎉
```

**Test the AI (without phone):**

```bash
curl -X POST http://localhost:3000/test-ai \
  -H "Content-Type: application/json" \
  -d '{"message": "Are you open on Sunday?"}'
```

### Step 6: Deploy to Google Cloud Platform

**Install Google Cloud SDK:**
```bash
# Follow instructions at: https://cloud.google.com/sdk/docs/install
```

**Deploy:**

```bash
# Login to GCP
gcloud auth login

# Set your project
gcloud config set project YOUR_PROJECT_ID

# Deploy to Cloud Run (recommended)
gcloud run deploy vertex-twilio-gateway \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID" \
  --set-env-vars "TWILIO_ACCOUNT_SID=YOUR_TWILIO_SID" \
  --set-env-vars "TWILIO_AUTH_TOKEN=YOUR_TWILIO_TOKEN" \
  --set-env-vars "TWILIO_PHONE_NUMBER=+13348888892"

# Note your deployed URL (e.g., https://vertex-twilio-gateway-xxx.run.app)
```

### Step 7: Configure Twilio Webhook

1. **Go to Twilio Console:** [console.twilio.com](https://console.twilio.com)
2. **Navigate to:** Phone Numbers → Manage → Active Numbers
3. **Click on** your number: +1 334 888 8892
4. **Under "Voice Configuration":**
   - Configure with: Webhooks
   - A call comes in: `https://YOUR_DEPLOYED_URL/voice` (POST)
   - Click "Save"

### Step 8: Test the Phone Line

Call **+1 334 888 8892** and talk to your AI assistant!

---

## 📁 Project Structure

```
vetex-ai-integration/
├── src/
│   ├── server.js              # Main Express server
│   ├── vertexClient.js        # Vertex AI integration
│   ├── twilioHandler.js       # Twilio Media Streams
│   ├── audioProcessor.js      # Audio format conversion
│   └── transcriptLogger.js    # Call logging
├── config/
│   ├── config.js              # Configuration manager
│   └── vertex-credentials.json # GCP credentials (not in git)
├── logs/transcripts/          # Call transcripts (not in git)
├── package.json
├── .env                       # Environment variables (not in git)
└── README.md
```

---

## 🔧 API Endpoints

### Health Check
```bash
GET /health
```

Returns server status and active connections.

### Voice Webhook (Twilio)
```bash
POST /voice
```

Receives incoming call notifications from Twilio.

### Media Stream (WebSocket)
```bash
WS /media-stream
```

Real-time audio streaming between Twilio and server.

### Test AI
```bash
POST /test-ai
Body: { "message": "Your question here" }
```

Test the AI without making a phone call.

### Get Transcript
```bash
GET /transcript/:callSid
```

Retrieve transcript for a specific call.

---

## 🐛 Troubleshooting

### Issue: "Cannot find module '@google-cloud/vertexai'"
**Solution:** Run `npm install`

### Issue: "Error: Could not load the default credentials"
**Solution:** Ensure `config/vertex-credentials.json` exists and `GOOGLE_APPLICATION_CREDENTIALS` is set in `.env`

### Issue: Call connects but no audio
**Solution:** 
- Check that your webhook URL is correct in Twilio
- Ensure it uses `wss://` (secure WebSocket) not `ws://`
- Verify your server is publicly accessible

### Issue: AI responses are slow
**Solution:**
- Check your internet connection
- Verify Vertex AI model is available in your region
- Consider upgrading to a faster model

### Issue: "WebSocket connection failed"
**Solution:**
- Ensure your deployment supports WebSockets (Cloud Run does)
- Check firewall settings
- Verify the `/media-stream` path is correct

---

## 📊 Monitoring

### View Logs (Cloud Run)
```bash
gcloud run services logs read vertex-twilio-gateway \
  --region us-central1 \
  --limit 50
```

### Check Active Calls
```bash
curl https://YOUR_DEPLOYED_URL/health
```

### View Call Transcripts
Check the `logs/transcripts/` directory or use the API:
```bash
curl https://YOUR_DEPLOYED_URL/transcript/CALL_SID
```

---

## 🔐 Security Notes

- Never commit `.env` file or credentials to Git
- Rotate Twilio auth tokens regularly
- Use GCP IAM roles with least privilege
- Enable Cloud Run authentication for production
- Review call logs for sensitive information

---

## 🚧 Known Limitations

1. **Text-to-Speech:** Currently uses basic implementation. For production, integrate Google Cloud Text-to-Speech API for better voice quality
2. **Speech-to-Text:** Audio streaming to speech-to-text needs full implementation
3. **Barge-in:** Basic implementation - can be enhanced with better voice activity detection

---

## 📝 Next Steps

1. **Integrate Google Cloud Speech-to-Text** for real-time transcription
2. **Integrate Google Cloud Text-to-Speech** for natural voice responses
3. **Add appointment booking** database integration
4. **Implement CRM integration** for lead tracking
5. **Add analytics dashboard** for call metrics

---

## 🤝 Support

For issues or questions:
- Create an issue in GitHub
- Contact: osama@carpass.ai
- Documentation: [Vertex AI Docs](https://cloud.google.com/vertex-ai/docs)

---

## 📄 License

MIT License - see LICENSE file for details

---

**Built with ❤️ for Carpass Motors**