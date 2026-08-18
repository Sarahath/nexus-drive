"use strict";

/**
 * Professional Game Engine Loop & Frame Manager
 * Manages fixed delta-time steps, performance stats, and update/render callbacks.
 */
export class Engine {
  constructor() {
    this.isRunning = false;
    this.isPaused = false;
    this.lastTime = 0;
    this.accumulatedTime = 0;
    this.targetFPS = 60;
    this.fixedDelta = 1 / 60; // 60 Hz physics step
    this.fps = 60;
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    
    this.updateCallbacks = [];
    this.renderCallbacks = [];

    this._bindVisibility();
  }

  /**
   * Register update callback (physics / game logic)
   */
  onUpdate(fn) {
    if (typeof fn === 'function') this.updateCallbacks.push(fn);
  }

  /**
   * Register render callback (graphics frame paint)
   */
  onRender(fn) {
    if (typeof fn === 'function') this.renderCallbacks.push(fn);
  }

  /**
   * Start the main engine loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  /**
   * Pause or resume the engine loop
   */
  setPaused(paused) {
    this.isPaused = paused;
    if (!paused) {
      this.lastTime = performance.now();
    }
  }

  /**
   * Internal animation frame loop with fixed time-step physics accumulator
   */
  _loop(currentTime) {
    if (!this.isRunning) return;

    requestAnimationFrame((t) => this._loop(t));

    if (this.isPaused) return;

    const delta = Math.min((currentTime - this.lastTime) / 1000, 0.1); // Cap delta at 100ms
    this.lastTime = currentTime;

    // Calculate FPS
    this.frameCount++;
    if (currentTime - this.lastFpsUpdate >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = currentTime;
    }

    // Fixed time-step accumulator for physics stability
    this.accumulatedTime += delta;
    while (this.accumulatedTime >= this.fixedDelta) {
      for (const fn of this.updateCallbacks) {
        fn(this.fixedDelta);
      }
      this.accumulatedTime -= this.fixedDelta;
    }

    // Render step
    for (const fn of this.renderCallbacks) {
      fn(delta);
    }
  }

  /**
   * Pause loop automatically when browser tab is inactive
   */
  _bindVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.setPaused(true);
      } else {
        this.setPaused(false);
      }
    });
  }
}
