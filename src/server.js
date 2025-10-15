// src/server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const config = require('../config/config');
const TwilioMediaStreamHandler = require('./twilioHandler');
const vertexClient = require('./vertexLiveClient'); // Use the new file name

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/media-stream' });

// Initialize Twilio Media Stream handler
const twilioHandler = new TwilioMediaStreamHandler(wss);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
 res.json({
  status: 'healthy',
  timestamp: new Date().toISOString(),
  activeConnections: twilioHandler.getActiveConnections(),
  activeSessions: vertexClient.getActiveSessionCount()
 });
});

/**
 * TwiML endpoint - Twilio calls this when a call comes in
 * FIX: Inject CallSid into the WebSocket URL query string.
 */
app.post('/voice', (req, res) => {
 console.log('📞 Incoming call from:', req.body.From);
 const callSid = req.body.CallSid;
 
 // Generate TwiML response
 const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
 <Connect>
  <Stream url="wss://${req.get('host')}/media-stream?CallSid=${callSid}">
   <Parameter name="From" value="${req.body.From}" />
   <Parameter name="To" value="${req.body.To}" />
  </Stream>
 </Connect>
</Response>`;

 res.type('text/xml');
 res.send(twiml);
});

/**
 * Endpoint to manually test the AI (for development) - NOW OBSOLETE
 */
app.post('/test-ai', async (req, res) => {
 res.status(501).json({
  success: false,
  message: 'Live AI stream is audio-only. Please call the phone number to test.'
 });
});

/**
 * Get transcript for a specific call
 */
app.get('/transcript/:callSid', async (req, res) => {
 const { callSid } = req.params;

 try {
  const transcriptLogger = require('./transcriptLogger');
  const transcript = await transcriptLogger.getTranscript(callSid);

  if (!transcript) {
   return res.status(404).json({
    success: false,
    message: 'Transcript not found'
   });
  }

  res.json({
   success: true,
   transcript
  });
 } catch (error) {
  console.error('Error fetching transcript:', error);
  res.status(500).json({
   success: false,
   error: error.message
  });
 }
});

/**
 * Root endpoint with API info
 */
app.get('/', (req, res) => {
 res.json({
  service: 'Vertex AI x Twilio Voice Gateway',
  version: '1.0.0',
  dealership: 'Carpass Motors',
  phone: config.twilio.phoneNumber,
  endpoints: {
   health: '/health',
   voice: '/voice (POST)',
   mediaStream: '/media-stream (WebSocket)',
   testAI: '/test-ai (POST - Obsolete)',
   transcript: '/transcript/:callSid (GET)'
  }
 });
});

// Error handling middleware
app.use((err, req, res, next) => {
 console.error('Server error:', err);
 res.status(500).json({
  error: 'Internal Server Error',
  message: err.message
 });
});

// Start the server
server.listen(config.server.port, () => {
 console.log(`🚀 Gateway Server running on port ${config.server.port}`);
 console.log(`GCP Project: ${config.vertexAI.projectId} in ${config.vertexAI.location}`);
});