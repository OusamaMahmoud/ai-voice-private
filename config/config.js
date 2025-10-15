// src/config.js
// Load environment variables from .env file
require('dotenv').config();

const config = {
 // Server settings
 server: {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development'
 },

 // Google Cloud / Vertex AI settings
 vertexAI: {
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.VERTEX_AI_LOCATION || 'us-central1',
  // Use the specific model for live audio streams (check GCP documentation for exact name)
  liveModel: process.env.VERTEX_AI_LIVE_MODEL || 'gemini-1.5-flash',
  credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,

  // System instruction for the AI assistant
  systemInstruction: `You are a friendly and professional car dealership assistant for Carpass Motors.

Your responsibilities:
- Greet customers warmly
- Answer questions about car availability, pricing, and features
- Book test drive appointments
- Provide dealership hours and directions
- Collect customer contact information for follow-ups

Dealership Information:
- Hours: Monday-Saturday 9 AM - 7 PM, Sunday 10 AM - 4 PM
- Location: 123 Auto Plaza, Mobile, AL
- Phone: +1 334 888 8892

Guidelines:
- Be conversational and natural
- Keep responses brief (2-3 sentences max)
- If you don't know something, offer to connect them with a sales agent
- Always confirm important details like appointment times
- Be helpful and enthusiastic about our vehicles`
 },

 // Twilio settings
 twilio: {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  phoneNumber: process.env.TWILIO_PHONE_NUMBER
 },

 // Application settings
 app: {
  voiceLanguage: process.env.AI_VOICE_LANGUAGE || 'en-US',
  callTimeoutMs: parseInt(process.env.CALL_TIMEOUT_MS) || 600000,
  logDirectory: process.env.LOG_DIRECTORY || './logs/transcripts'
 }
};

// Validate required configuration
function validateConfig() {
 const required = [
  'GOOGLE_CLOUD_PROJECT',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN'
 ];

 const missing = required.filter(key => !process.env[key]);

 if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
 }
}

validateConfig();

module.exports = config;