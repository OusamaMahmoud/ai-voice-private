// src/server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const helmet = require('helmet');
const cors = require('cors');
const config = require('../config/config');
const TwilioMediaStreamHandler = require('./twilioHandler');
const vertexClient = require('./vertexLiveClient');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/media-stream' });

// Initialize Twilio Media Stream handler
const twilioHandler = new TwilioMediaStreamHandler(wss);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

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
 */
app.post('/voice', (req, res) => {
 try {
  console.log('📞 Incoming call from:', req.body.From);
  const callSid = req.body.CallSid;
  
  if (!callSid) {
   console.error('❌ Missing CallSid in voice request');
   return res.status(400).send('Missing CallSid');
  }
  
  // Generate TwiML response
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
 <Connect>
  <Stream url="wss://${req.get('host')}/media-stream?CallSid=${callSid}">
   <Parameter name="From" value="${req.body.From || 'Unknown'}" />
   <Parameter name="To" value="${req.body.To || config.twilio.phoneNumber}" />
  </Stream>
 </Connect>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
  console.log(`✅ TwiML response sent for call: ${callSid}`);
 } catch (error) {
  console.error('❌ Error in voice endpoint:', error);
  res.status(500).send('Internal Server Error');
 }
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
 console.error('❌ Server error:', {
  error: err.message,
  stack: err.stack,
  url: req.url,
  method: req.method,
  timestamp: new Date().toISOString()
 });
 
 res.status(500).json({
  error: 'Internal Server Error',
  message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
  timestamp: new Date().toISOString()
 });
});

// Start the server
server.listen(config.server.port, () => {
 console.log(`🚀 Gateway Server running on port ${config.server.port}`);
 console.log(`🌍 Environment: ${config.server.nodeEnv}`);
 console.log(`🔧 GCP Project: ${config.vertexAI.projectId} in ${config.vertexAI.location}`);
 console.log(`📞 Twilio Phone: ${config.twilio.phoneNumber}`);
 console.log(`🤖 AI Model: ${config.vertexAI.liveModel}`);
 console.log(`📁 Log Directory: ${config.app.logDirectory}`);
 console.log('✅ Server is ready to accept calls!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
 console.log('🛑 SIGTERM received, shutting down gracefully');
 server.close(() => {
  console.log('✅ Server closed');
  process.exit(0);
 });
});

process.on('SIGINT', () => {
 console.log('🛑 SIGINT received, shutting down gracefully');
 server.close(() => {
  console.log('✅ Server closed');
  process.exit(0);
 });
});