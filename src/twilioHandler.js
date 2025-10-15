// src/twilioHandler.js
const WebSocket = require('ws');
const { parse } = require('url'); // Required for extracting CallSid from URL
const vertexLiveClient = require('./vertexLiveClient');
const transcriptLogger = require('./transcriptLogger');


class TwilioMediaStreamHandler {
    constructor(wss) {
        this.wss = wss;
        this.connections = new Map(); // callSid -> { ws, streamSid, callMetadata, ... }

        // Setup WebSocket connection handler
        wss.on('connection', this.handleConnection.bind(this));
        console.log(`📡 Media Stream WebSocket ready on path: /media-stream`);
    }

    handleConnection(ws, req) {
        // 1. Extract callSid from the WebSocket upgrade request URL (query parameters)
        const query = parse(req.url, true).query;
        const callSid = query.CallSid; // Get CallSid from the query parameters

        if (!callSid) {
            console.error('❌ WebSocket connection rejected: CallSid missing in request parameters.');
            ws.close(1008, 'Missing CallSid');
            return;
        }

        console.log(`🔌 New WebSocket connection for CallSid: ${callSid}`);

        // 2. Store the connection data
        this.connections.set(callSid, { ws, streamSid: null, callMetadata: {} });

        // 3. Bind the message handler with the specific callSid
        ws.on('message', this.handleMessage.bind(this, ws, callSid));
        
        ws.on('close', () => this.handleWebSocketClose(callSid));
        ws.on('error', (error) => console.error(`❌ WS Error for ${callSid}:`, error));
    }

    /**
     * Handle incoming messages from Twilio
     */
    async handleMessage(ws, callSid, message) {
        const msg = JSON.parse(message);
        const conn = this.connections.get(callSid);

        if (!conn) {
             console.warn(`⚠️ Received message for unknown CallSid: ${callSid}`);
             return;
        }

        switch (msg.event) {
            case 'connected':
                console.log(`🔥 Stream connected for call: ${callSid}`);
                
                const callMetadata = {
                    // Pull from 'From'/'To' parameters if passed in the URL (TwiML <Parameter>)
                    from: conn.callMetadata.from || msg.From, 
                    to: conn.callMetadata.to || msg.To
                };
                conn.callMetadata = callMetadata;
                
                // --- VERTEX LIVE API INTEGRATION ---
                try {
                    await vertexLiveClient.createSession(
                        callSid, 
                        // onAudioResponse: sends AI audio back to Twilio
                        (audioBase64) => this.sendAudioToTwilio(callSid, conn.streamSid, audioBase64, ws),
                        // onTranscript: logs partial/final transcripts (optional)
                        (transcriptPart) => console.log(`[Transcript ${transcriptPart.isFinal ? 'F' : 'P'}]: ${transcriptPart.text}`)
                    );
                } catch (error) {
                    console.error('❌ Failed to create Live Stream session:', error);
                    ws.close(1011, 'AI Stream Error');
                }
                // --------------------------------
                
                break;

            case 'start':
                console.log(`🎙️ Stream started for call: ${callSid}`);
                conn.streamSid = msg.streamSid; // Store the streamSid for media frames
                break;

            case 'media':
                // --- VERTEX LIVE API INTEGRATION ---
                if (msg.media && msg.media.payload) {
                    // Send Twilio mulaw audio chunk directly to the Vertex Live Stream
                    vertexLiveClient.processAudio(callSid, msg.media.payload);
                }
                // --------------------------------
                break;

            case 'stop':
                console.log(`🛑 Stop received for call: ${callSid}`);
                await this.handleCallEnd(callSid, conn.callMetadata);
                break;

            case 'error':
                console.error(`🚨 Twilio Media Stream Error for ${callSid}:`, msg);
                await this.handleCallEnd(callSid, conn.callMetadata);
                break;

            default:
                break;
        }
    }

    /**
     * Send base64 audio (from Live Stream) to Twilio
     */
    sendAudioToTwilio(callSid, streamSid, audioBase64, ws) {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn(`⚠️ No active WebSocket for call: ${callSid}`);
            return;
        }

        // Get streamSid from connection map if not passed (if needed for older audio chunks)
        if (!streamSid) {
            const conn = this.connections.get(callSid);
            streamSid = conn ? conn.streamSid : null;
        }

        if (!streamSid) {
            console.warn(`⚠️ Cannot send audio for ${callSid}: streamSid is not yet defined.`);
            return;
        }

        // 1. Send the audio media frame to Twilio
        const message = {
            event: 'media',
            streamSid: streamSid,
            media: {
                payload: audioBase64 // Base64 MULAW 8kHz audio from Vertex AI
            }
        };

        ws.send(JSON.stringify(message));
    }
    
    /**
     * Handle WebSocket close event
     */
    handleWebSocketClose(callSid) {
        const conn = this.connections.get(callSid);
        if (conn) {
            console.log(`✖️ Media Stream closed for call: ${callSid}`);
            this.handleCallEnd(callSid, conn.callMetadata || {}); 
        }
    }

    /**
     * Handle call end - save transcript
     */
    async handleCallEnd(callSid, callMetadata) {
        if (!callSid) return;

        // End Vertex AI Live Stream and get transcript
        const sessionData = await vertexLiveClient.endSession(callSid); 

        if (sessionData && sessionData.transcript) {
            const transcript = sessionData.transcript;
            
            try {
                 const duration = sessionData.duration || 0; 
                 
                 // Note: Ensure transcriptLogger.generateSummary is implemented to handle the transcript array format
                 const summary = transcriptLogger.generateSummary(transcript);
            
                 await transcriptLogger.saveTranscript(callSid, transcript, {
                    from: callMetadata.from,
                    to: callMetadata.to,
                    duration: duration, 
                    summary: summary
                 });
                 console.log(`💾 Transcript saved: ${callSid}`);
            } catch (error) {
                console.error(`❌ Error saving transcript for ${callSid}:`, error);
            }
        }

        // Final cleanup
        this.connections.delete(callSid);
    }

    /**
     * Get active connection count
     */
    getActiveConnections() {
        return this.connections.size;
    }
}

module.exports = TwilioMediaStreamHandler;