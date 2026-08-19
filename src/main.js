"use strict";

import { Engine } from './core/Engine.js';
import { RendererManager } from './core/Renderer.js';
import { InputManager } from './core/InputManager.js';
import { Vehicle } from './entities/Vehicle.js';
import { CityGrid } from './entities/CityGrid.js';
import { HUDManager } from './ui/HUDManager.js';
import { SoundEngine } from './audio/SoundEngine.js';

/**
 * Main Professional Application Orchestrator
 */
class GameApp {
  constructor() {
    this.engine = new Engine();
    this.rendererManager = new RendererManager();
    this.inputManager = new InputManager();
    this.hudManager = new HUDManager();
    this.soundEngine = new SoundEngine();

    this.city = new CityGrid(this.rendererManager.scene);
    this.vehicle = new Vehicle(0x2ee6d6);

    this.rendererManager.scene.add(this.vehicle.mesh);
    this.vehicle.reset(2, 8, 0);

    this._bindEvents();
    this._setupLoop();
  }

  _bindEvents() {
    const startAudio = () => {
      this.soundEngine.init();
      window.removeEventListener('click', startAudio);
      window.removeEventListener('keydown', startAudio);
    };
    window.addEventListener('click', startAudio);
    window.addEventListener('keydown', startAudio);
  }

  _setupLoop() {
    // Fixed Time-Step Update Callback (60 Hz)
    this.engine.onUpdate((dt) => {
      this.vehicle.update(dt, this.inputManager);
      
      // Update Audio Pitch
      this.soundEngine.updateEnginePitch(this.vehicle.rpmPercentage, this.inputManager.throttle);
      
      // Update HUD Telemetry
      this.hudManager.updateTelemetry(this.vehicle.speed, this.vehicle.gear, this.vehicle.rpmPercentage);
    });

    // Render Callback (Draw Frame)
    this.engine.onRender((dt) => {
      this.rendererManager.updateChaseCamera(this.vehicle.pos, this.vehicle.heading, this.vehicle.speed, dt);
      this.rendererManager.render();
    });

    // Start Engine
    this.engine.start();
    this.hudManager.showToast('🚀 Professional 3D Car Engine Initialized!');
  }
}

// Instantiate App when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.gameApp = new GameApp();
});
