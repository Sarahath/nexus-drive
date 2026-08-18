"use strict";

/**
 * Unified Input Manager
 * Handles Keyboard (WASD/Arrows), Touch Pedals/Steering, and Gamepad API.
 */
export class InputManager {
  constructor() {
    this.throttle = 0; // 0 to 1
    this.brake = 0;    // 0 to 1
    this.steer = 0;    // -1 (Left) to +1 (Right)
    this.handbrake = false;
    this.gearShiftUp = false;
    this.gearShiftDown = false;

    this.keys = {};
    this._bindKeyboard();
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      this._updateState();
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this._updateState();
    });
  }

  _updateState() {
    // Throttle (W / Up Arrow)
    this.throttle = (this.keys['KeyW'] || this.keys['ArrowUp']) ? 1 : 0;

    // Brake / Reverse (S / Down Arrow)
    this.brake = (this.keys['KeyS'] || this.keys['ArrowDown']) ? 1 : 0;

    // Steering (A / D or Left / Right Arrows)
    let s = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) s -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) s += 1;
    this.steer = s;

    // Handbrake (Space)
    this.handbrake = !!this.keys['Space'];

    // Manual Gear Shift (Digit 1 up, Digit 2 down)
    this.gearShiftUp = !!this.keys['Digit1'];
    this.gearShiftDown = !!this.keys['Digit2'];
  }
}
