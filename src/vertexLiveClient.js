// src/vertexLiveClient.js
const WebSocket = require('ws');
const { GoogleAuth } = require('google-auth-library');
const config = require('../config/config');

/**
 * Vertex AI Live API Client (Gemini 2.0/2.5 Live)
 * Uses WebSocket for real-time voice-to-voice communication
 * * NOTE: The audioCodec dependency is removed by configuring Vertex AI to use MULAW 8kHz natively.
 */
class VertexLiveClient {
  constructor() {
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    this.activeSessions = new Map();
    this.project = config.vertexAI.projectId;
    this.location = config.vertexAI.location;
    // Use the model defined in config.js
    this.model = config.vertexAI.liveModel; 
  }

  /**
   * Get WebSocket URL for Vertex AI Live API
   */
  async getWebSocketUrl() {
    const token = await this.auth.getAccessToken();
    
    // Vertex AI Live API WebSocket endpoint
    const baseUrl = `wss://${this.location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
    
    return {
      url: baseUrl,
      token: token
    };
  }

  /**
   * Create a new Live API session for a call
   */
  async createSession(callSid, onAudioResponse, onTranscript) {
    try {
      console.log(`🤖 Creating Vertex AI Live session for call: ${callSid}`);

      const { url, token } = await this.getWebSocketUrl();

      // Create WebSocket connection to Vertex AI
      const ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
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
        isConnected: false
      };

      this.activeSessions.set(callSid, session);

      // Setup WebSocket event handlers
      await this.setupSessionHandlers(session);

      return session;

    } catch (error) {
      console.error('❌ Error creating Live session:', error);
      throw error;
    }
  }

  /**
   * Setup WebSocket event handlers for a session
   */
  async setupSessionHandlers(session) {
    const { ws, callSid } = session;

    return new Promise((resolve, reject) => {
      ws.on('open', async () => {
        console.log(`✅ WebSocket connected for call: ${callSid}`);
        session.isConnected = true;
        session.isActive = true;

        // Send setup message with audio configuration
        await this.sendSetupMessage(session);

        // Send initial greeting trigger
        await this.sendInitialGreeting(session);

        resolve();
      });

      ws.on('message', (data) => {
        this.handleServerMessage(session, data);
      });

      ws.on('error', (error) => {
        console.error(`❌ WebSocket error for ${callSid}:`, error);
        reject(error);
      });

      ws.on('close', () => {
        console.log(`🔌 WebSocket closed for ${callSid}`);
        session.isActive = false;
        this.activeSessions.delete(callSid);
      });
    });
  }

  /**
   * Send setup message to configure the Live API session, including MULAW audio config
   */
  async sendSetupMessage(session) {
    const setupMessage = {
      setup: {
        model: `projects/${this.project}/locations/${this.location}/publishers/google/models/${this.model}`,
        generation_config: {
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: 'Aoede' // Female voice, good for customer service
              }
            }
          },
          temperature: 0.8,
          max_output_tokens: 200
        },
        system_instruction: {
          parts: [{
            text: config.vertexAI.systemInstruction
          }]
        },
        // *** CRITICAL: Configure for Twilio MULAW 8kHz input/output ***
        audio_in_config: {
          encoding: 'MULAW', // Twilio input encoding
          sample_rate_hertz: 8000
        },
        audio_out_config: {
          encoding: 'MULAW', // Twilio output encoding
          sample_rate_hertz: 8000
        }
      }
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
      await new Promise(resolve => setTimeout(resolve, 500));

      // We send a message to trigger the AI's first response (the greeting)
      const greetingMessage = {
        client_content: {
          turns: [{
            role: 'user',
            parts: [{
              text: 'Hello' // A simple trigger
            }]
          }],
          turn_complete: true
        }
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

      // Handle ASR (Speech-to-Text) results
      if (message.realtimeOutput && message.realtimeOutput.speechToText) {
        const asrResult = message.realtimeOutput.speechToText;
        const transcriptText = asrResult.text;

        if (transcriptText) {
          console.log(`🎤 ASR (${asrResult.isFinal ? 'FINAL' : 'PARTIAL'}): "${transcriptText}"`);
          
          if (asrResult.isFinal) {
            // Save final user turn to transcript
            session.transcript.push({
              role: 'user',
              content: transcriptText,
              timestamp: Date.now()
            });
          }
          if (session.onTranscript) {
            session.onTranscript({ role: 'user', text: transcriptText, isFinal: asrResult.isFinal });
          }
        }
      }

      // Handle LLM/TTS response
      if (message.serverContent && message.serverContent.modelTurn) {
        const modelTurn = message.serverContent.modelTurn;
        
        if (modelTurn.parts) {
          modelTurn.parts.forEach(part => {
            
            // Handle TTS audio response
            if (part.inlineData && part.inlineData.mimeType.includes('audio')) {
              console.log(`🎵 Received audio chunk for ${session.callSid}`);
              
              // Audio is already base64 encoded MULAW 8kHz (due to audio_out_config)
              const twilioAudioBase64 = part.inlineData.data;
              
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
      return;
    }

    try {
      // *** CRITICAL: Send Twilio's base64 MULAW audio directly ***
      const audioMessage = {
        realtimeInput: {
          mediaChunks: [{
            mimeType: 'audio/mulaw',
            data: audioBase64 // Directly pass Twilio's base64 payload
          }]
        }
      };

      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify(audioMessage));
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