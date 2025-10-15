/**
 * Audio format converter for Twilio ↔ Vertex AI
 * 
 * Twilio sends: mulaw encoded audio at 8kHz
 * Vertex AI expects: PCM 16-bit linear at 16kHz or 24kHz
 */

class AudioProcessor {
  constructor() {
    // mulaw to linear conversion table
    this.MULAW_TABLE = this.generateMulawTable();
  }

  // Generate mulaw to linear PCM conversion table
  generateMulawTable() {
    const table = new Int16Array(256);
    for (let i = 0; i < 256; i++) {
      const mulaw = ~i;
      const sign = (mulaw & 0x80) !== 0 ? -1 : 1;
      const mantissa = (mulaw & 0x0F) << 3;
      const exponent = (mulaw >> 4) & 0x07;
      const linear = sign * ((mantissa + 0x84) << exponent) - 33;
      table[i] = linear;
    }
    return table;
  }

  /**
   * Convert mulaw audio to PCM16
   * @param {Buffer} mulawBuffer - mulaw encoded audio from Twilio
   * @returns {Buffer} PCM16 encoded audio for Vertex AI
   */
  mulawToPcm16(mulawBuffer) {
    const pcm16Buffer = Buffer.alloc(mulawBuffer.length * 2);
    
    for (let i = 0; i < mulawBuffer.length; i++) {
      const linear = this.MULAW_TABLE[mulawBuffer[i]];
      pcm16Buffer.writeInt16LE(linear, i * 2);
    }
    
    return pcm16Buffer;
  }

  /**
   * Resample audio from 8kHz to 16kHz (simple linear interpolation)
   * @param {Buffer} pcm16Buffer - PCM16 at 8kHz
   * @returns {Buffer} PCM16 at 16kHz
   */
  resample8to16(pcm16Buffer) {
    const samples8k = pcm16Buffer.length / 2;
    const samples16k = samples8k * 2;
    const output = Buffer.alloc(samples16k * 2);

    for (let i = 0; i < samples16k; i++) {
      const srcIndex = i / 2;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, samples8k - 1);
      const fraction = srcIndex - srcIndexFloor;

      const sample1 = pcm16Buffer.readInt16LE(srcIndexFloor * 2);
      const sample2 = pcm16Buffer.readInt16LE(srcIndexCeil * 2);
      const interpolated = Math.round(sample1 * (1 - fraction) + sample2 * fraction);

      output.writeInt16LE(interpolated, i * 2);
    }

    return output;
  }

  /**
   * Convert Twilio mulaw audio to Vertex AI format
   * @param {string} base64Audio - Base64 encoded mulaw audio from Twilio
   * @returns {Buffer} PCM16 audio ready for Vertex AI
   */
  twilioToVertex(base64Audio) {
    // Decode base64 to mulaw buffer
    const mulawBuffer = Buffer.from(base64Audio, 'base64');
    
    // Convert mulaw to PCM16 at 8kHz
    const pcm16_8k = this.mulawToPcm16(mulawBuffer);
    
    // Resample to 16kHz for Vertex AI
    const pcm16_16k = this.resample8to16(pcm16_8k);
    
    return pcm16_16k;
  }

  /**
   * Convert Vertex AI PCM audio to Twilio mulaw format
   * @param {Buffer} pcm16Buffer - PCM16 audio from Vertex AI
   * @returns {string} Base64 encoded mulaw audio for Twilio
   */
  vertexToTwilio(pcm16Buffer) {
    // For simplicity, we'll downsample and convert to mulaw
    // In production, you might want a more sophisticated conversion
    const mulawBuffer = Buffer.alloc(pcm16Buffer.length / 2);
    
    for (let i = 0; i < mulawBuffer.length; i++) {
      const linear = pcm16Buffer.readInt16LE(i * 2);
      mulawBuffer[i] = this.linearToMulaw(linear);
    }
    
    return mulawBuffer.toString('base64');
  }

  /**
   * Convert linear PCM sample to mulaw
   * @param {number} linear - Linear PCM sample
   * @returns {number} Mulaw encoded byte
   */
  linearToMulaw(linear) {
    const MAX = 0x1FFF;
    const BIAS = 33;
    
    let sign = (linear < 0) ? 0x80 : 0x00;
    if (linear < 0) linear = -linear;
    if (linear > MAX) linear = MAX;
    
    linear += BIAS;
    
    let exponent = 7;
    for (let expMask = 0x4000; (linear & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1);
    
    const mantissa = (linear >> (exponent + 3)) & 0x0F;
    const mulaw = ~(sign | (exponent << 4) | mantissa);
    
    return mulaw & 0xFF;
  }

  /**
   * Get audio chunk info for logging
   */
  getAudioInfo(buffer) {
    return {
      size: buffer.length,
      duration: buffer.length / (16000 * 2), // seconds at 16kHz, 16-bit
      samples: buffer.length / 2
    };
  }
}

module.exports = new AudioProcessor();