"use strict";

/**
 * Web Audio API Engine Synthesizer & Sound FX Manager
 * Generates dynamic engine RPM pitch shifts and sound FX procedurally without external MP3 files.
 */
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.osc1 = null;
    this.osc2 = null;
    this.gainNode = null;
    this.isMuted = false;
    this.initialized = false;
  }

  /**
   * Initialize Web Audio Context on first user interaction
   */
  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master Gain
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = 0.15;
      this.gainNode.connect(this.ctx.destination);

      // Engine Dual Oscillators
      this.osc1 = this.ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc1.frequency.value = 60;
      this.osc1.connect(this.gainNode);
      this.osc1.start();

      this.osc2 = this.ctx.createOscillator();
      this.osc2.type = 'triangle';
      this.osc2.frequency.value = 120;
      this.osc2.connect(this.gainNode);
      this.osc2.start();

      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio API not supported', e);
    }
  }

  /**
   * Update engine sound frequency pitch based on RPM percentage
   */
  updateEnginePitch(rpmPct, throttle) {
    if (!this.initialized || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const baseFreq = 50 + (rpmPct / 100) * 180;
    const targetGain = 0.05 + (throttle * 0.15) + (rpmPct / 100) * 0.1;

    this.osc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.05);
    this.osc2.frequency.setTargetAtTime(baseFreq * 1.5, this.ctx.currentTime, 0.05);
    this.gainNode.gain.setTargetAtTime(this.isMuted ? 0 : targetGain, this.ctx.currentTime, 0.05);
  }
}
