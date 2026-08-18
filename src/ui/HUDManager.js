"use strict";

/**
 * Professional HUD & Instrument Cluster Manager
 * Handles Speedometer, Tachometer RPM gauge, Gear readout, and Toast notifications.
 */
export class HUDManager {
  constructor() {
    this.speedEl = document.getElementById('g-spd') || document.getElementById('fv');
    this.rpmArc = document.getElementById('spd-arc');
    this.gearEl = document.getElementById('gear-val');
    this.toastEl = document.getElementById('toast');
    this.toastTimer = null;
  }

  /**
   * Update Instrument Cluster telemetry
   */
  updateTelemetry(speedMs, gear, rpmPct) {
    const kmh = Math.round(Math.abs(speedMs) * 3.6);

    if (this.speedEl) {
      this.speedEl.textContent = kmh;
    }

    if (this.gearEl) {
      this.gearEl.textContent = gear;
    }

    if (this.rpmArc) {
      const maxOffset = 440;
      const offset = maxOffset - (maxOffset * (rpmPct / 100));
      this.rpmArc.style.strokeDashoffset = Math.max(0, offset);
    }
  }

  /**
   * Display floating toast notification banner
   */
  showToast(message, duration = 3000) {
    if (!this.toastEl) {
      const div = document.createElement('div');
      div.id = 'toast';
      div.className = 'toast-banner';
      document.body.appendChild(div);
      this.toastEl = div;
    }

    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, duration);
  }
}
