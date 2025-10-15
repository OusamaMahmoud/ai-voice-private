// src/vertexLiveClient.js
const WebSocket = require('ws');
const { GoogleAuth } = require('google-auth-library');
const config = require('../config/config');
const audioProcessor = require('./audioProcessor');

/**
 * Vertex AI Live API Client (Gemini 2.0 Flash Live)
 * Uses WebSocket for real-time voice-to-voice communication
 * Handles proper audio format conversion between Twilio and Vertex AI
 */
class VertexLiveClient {
  constructor() {
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    this.activeSessions = new Map();
    this.project = config.vertexAI.projectId;
    this.location = config.vertexAI.location;
    this.model = config.vertexAI.liveModel;
  }

  /**
   * Get WebSocket URL for Vertex AI Live API
   */
  async getWebSocketUrl() {
    const token = await this.auth.getAccessToken();
    
    // Correct Vertex AI Live API WebSocket endpoint
    const baseUrl = `wss://${this.location}-aiplatform.googleapis.com/v1/projects/${this.project}/locations/${this.location}/publishers/google/models/${this.model}:streamGenerateContent`;
    
    return {
      url: baseUrl,
      token: token
    };
  }

  /**
   * Create a new Live API session for a call
   */
  async createSession(callSid, onAudioResponse, onTranscript, retryCount = 0) {
    const maxRetries = 3;
    
    try {
      console.log(`🤖 Creating Vertex AI Live session for call: ${callSid} (attempt ${retryCount + 1})`);

      const { url, token } = await this.getWebSocketUrl();

      // Create WebSocket connection to Vertex AI
      const ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'CarpassMotors-AI-Assistant/1.0'
        }
      });

      const session = {
        callSid,
        ws,
        transcript: [],
        isActive: false,
        onAudioResponse,
        onTranscript,
        startTime: Date.now(),
        isConnected: false,
        retryCount
      };

      this.activeSessions.set(callSid, session);

      // Setup WebSocket event handlers
      await this.setupSessionHandlers(session);

      return session;

    } catch (error) {
      console.error(`❌ Error creating Live session (attempt ${retryCount + 1}):`, error);
      
      // Retry logic
      if (retryCount < maxRetries) {
        console.log(`🔄 Retrying session creation for ${callSid} in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.createSession(callSid, onAudioResponse, onTranscript, retryCount + 1);
      } else {
        console.error(`❌ Max retries exceeded for ${callSid}`);
        throw error;
      }
    }
  }

  /**
   * Setup WebSocket event handlers for a session
   */
  async setupSessionHandlers(session) {
    const { ws, callSid } = session;
    let connectionTimeout;
    let heartbeatInterval;

    return new Promise((resolve, reject) => {
      // Set connection timeout
      connectionTimeout = setTimeout(() => {
        console.error(`⏰ WebSocket connection timeout for ${callSid}`);
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, 10000); // 10 second timeout

      ws.on('open', async () => {
        console.log(`✅ WebSocket connected for call: ${callSid}`);
        clearTimeout(connectionTimeout);
        session.isConnected = true;
        session.isActive = true;

        // Set up heartbeat
        heartbeatInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
          } else {
            clearInterval(heartbeatInterval);
          }
        }, 30000); // 30 second heartbeat

        try {
          // Send setup message with audio configuration
          await this.sendSetupMessage(session);

          // Send initial greeting trigger
          await this.sendInitialGreeting(session);

          resolve();
        } catch (error) {
          console.error(`❌ Error during session setup for ${callSid}:`, error);
          reject(error);
        }
      });

      ws.on('message', (data) => {
        this.handleServerMessage(session, data);
      });

      ws.on('pong', () => {
        console.log(`🏓 Pong received for ${callSid}`);
      });

      ws.on('error', (error) => {
        console.error(`❌ WebSocket error for ${callSid}:`, error);
        clearTimeout(connectionTimeout);
        clearInterval(heartbeatInterval);
        reject(error);
      });

      ws.on('close', (code, reason) => {
        console.log(`🔌 WebSocket closed for ${callSid} (code: ${code}, reason: ${reason})`);
        clearTimeout(connectionTimeout);
        clearInterval(heartbeatInterval);
        session.isActive = false;
        session.isConnected = false;
        this.activeSessions.delete(callSid);
      });
    });
  }

  /**
   * Send setup message to configure the Live API session
   */
  async sendSetupMessage(session) {
    const setupMessage = {
      contents: [{
        role: 'user',
        parts: [{
          text: 'Start conversation'
        }]
      }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Aoede' // Female voice, good for customer service
            }
          }
        },
        temperature: 0.8,
        maxOutputTokens: 200
      },
      systemInstruction: {
        parts: [{
          text: config.vertexAI.systemInstruction
        }]
      },
      // Configure for proper audio handling
      tools: [],
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        }
      ]
    };

    session.ws.send(JSON.stringify(setupMessage));
    console.log(`📤 Sent setup message for ${session.callSid}`);
  }

  /**
   * Send initial greeting trigger
   */
  async sendInitialGreeting(session) {
    try {
      // Wait a moment for setup to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Send a message to trigger the AI's first response (the greeting)
      const greetingMessage = {
        contents: [{
          role: 'user',
          parts: [{
            text: 'Hello, I would like to speak with someone about cars.'
          }]
        }]
      };

      session.ws.send(JSON.stringify(greetingMessage));
      console.log(`👋 Triggered greeting for ${session.callSid}`);
      
      // Log the expected greeting for transcript saving
      session.transcript.push({ 
        role: 'assistant', 
        content: "Welcome to Carpass Motors, how can I help you today?", 
        timestamp: Date.now() 
      });

    } catch (error) {
      console.error('❌ Error sending greeting:', error);
    }
  }

  /**
   * Handle incoming messages from Vertex AI
   */
  handleServerMessage(session, data) {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 Received message for ${session.callSid}:`, JSON.stringify(message, null, 2));

      // Handle candidate responses
      if (message.candidates && message.candidates.length > 0) {
        const candidate = message.candidates[0];
        
        if (candidate.content && candidate.content.parts) {
          candidate.content.parts.forEach(part => {
            // Handle TTS audio response
            if (part.inlineData && part.inlineData.mimeType.includes('audio')) {
              console.log(`🎵 Received audio chunk for ${session.callSid}`);
              
              // Convert audio to Twilio format
              const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
              const twilioAudioBase64 = audioProcessor.vertexToTwilio(audioBuffer);
              
              if (session.onAudioResponse) {
                session.onAudioResponse(twilioAudioBase64);
              }
            }

            // Handle LLM text transcript
            if (part.text) {
              console.log(`💬 AI: "${part.text}"`);
              
              // Save final AI turn to transcript
              session.transcript.push({
                role: 'assistant',
                content: part.text,
                timestamp: Date.now()
              });
              if (session.onTranscript) {
                session.onTranscript({ role: 'assistant', text: part.text, isFinal: true });
              }
            }
          });
        }
      }

      // Handle usage metadata
      if (message.usageMetadata) {
        console.log(`📊 Usage for ${session.callSid}:`, message.usageMetadata);
      }

    } catch (error) {
      console.error(`❌ Error handling server message for ${session.callSid}:`, error);
    }
  }

  /**
   * Process incoming audio from Twilio
   */
  async processAudio(callSid, audioBase64) {
    const session = this.activeSessions.get(callSid);
    
    if (!session || !session.isActive || !session.isConnected) {
      console.warn(`⚠️ Session not ready for audio processing: ${callSid}`);
      return;
    }

    try {
      // Convert Twilio MULAW audio to Vertex AI format
      const twilioAudioBuffer = Buffer.from(audioBase64, 'base64');
      const vertexAudioBuffer = audioProcessor.twilioToVertex(audioBase64);
      const vertexAudioBase64 = vertexAudioBuffer.toString('base64');

      // Send audio to Vertex AI
      const audioMessage = {
        contents: [{
          role: 'user',
          parts: [{
            inlineData: {
              mimeType: 'audio/pcm',
              data: vertexAudioBase64
            }
          }]
        }]
      };

      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify(audioMessage));
        console.log(`🎤 Sent audio chunk to Vertex AI for ${callSid}`);
      } else {
        console.warn(`⚠️ WebSocket not open for ${callSid}`);
      }

    } catch (error) {
      console.error(`❌ Error processing audio for ${callSid}:`, error);
    }
  }

  /**
   * End a Live API session
   */
  async endSession(callSid) {
    const session = this.activeSessions.get(callSid);
    
    if (!session) {
      return null;
    }

    try {
      session.isActive = false;
      session.endTime = Date.now();
      session.duration = session.endTime - session.startTime;

      console.log(`🏁 Ending session for ${callSid} (duration: ${session.duration}ms)`);

      // Close WebSocket connection
      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.close();
      }
      
      // Data to be returned for logging
      const sessionData = {
        callSid: session.callSid,
        transcript: session.transcript,
        duration: session.duration,
        startTime: session.startTime,
        endTime: session.endTime
      };

      this.activeSessions.delete(callSid);

      return sessionData;

    } catch (error) {
      console.error(`❌ Error ending session for ${callSid}:`, error);
      this.activeSessions.delete(callSid);
      return null;
    }
  }

  /**
   * Get active session count
   */
  getActiveSessionCount() {
    return this.activeSessions.size;
  }

  /**
   * Get session by call SID
   */
  getSession(callSid) {
    return this.activeSessions.get(callSid);
  }
}

module.exports = new VertexLiveClient();