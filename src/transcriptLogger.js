const fs = require('fs').promises;
const path = require('path');
const config = require('../config/config');

class TranscriptLogger {
  constructor() {
    this.logDirectory = config.app.logDirectory;
    this.ensureLogDirectory();
  }

  // Create logs directory if it doesn't exist
  async ensureLogDirectory() {
    try {
      await fs.mkdir(this.logDirectory, { recursive: true });
    } catch (error) {
      console.error('Error creating log directory:', error);
    }
  }

  // Save call transcript
  async saveTranscript(callSid, transcript, metadata = {}) {
    const timestamp = new Date().toISOString();
    const filename = `${callSid}_${timestamp.replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(this.logDirectory, filename);

    const logData = {
      callSid,
      timestamp,
      duration: metadata.duration || null,
      from: metadata.from || null,
      to: metadata.to || null,
      transcript: transcript,
      summary: metadata.summary || null
    };

    try {
      await fs.writeFile(filepath, JSON.stringify(logData, null, 2));
      console.log(`✅ Transcript saved: ${filename}`);
      return filepath;
    } catch (error) {
      console.error('❌ Error saving transcript:', error);
      throw error;
    }
  }

  // Generate a simple summary from transcript
  generateSummary(transcript) {
    if (!transcript || transcript.length === 0) {
      return 'No conversation recorded.';
    }

    const userMessages = transcript.filter(msg => msg.role === 'user');
    const aiMessages = transcript.filter(msg => msg.role === 'assistant');

    return {
      totalExchanges: Math.min(userMessages.length, aiMessages.length),
      userMessageCount: userMessages.length,
      aiMessageCount: aiMessages.length,
      firstUserMessage: userMessages[0]?.content || null,
      lastAiMessage: aiMessages[aiMessages.length - 1]?.content || null
    };
  }

  // Get all transcripts for a specific call
  async getTranscript(callSid) {
    try {
      const files = await fs.readdir(this.logDirectory);
      const callFiles = files.filter(f => f.startsWith(callSid));
      
      if (callFiles.length === 0) {
        return null;
      }

      const filepath = path.join(this.logDirectory, callFiles[0]);
      const data = await fs.readFile(filepath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading transcript:', error);
      return null;
    }
  }
}

module.exports = new TranscriptLogger();