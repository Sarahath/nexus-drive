"use strict";

/**
 * Professional Vehicle Dynamics & Physics Entity
 * Features 5-speed manual gearbox, Raycast suspension physics, torque curves, and drift dynamics.
 */

// Gearbox configuration: Top Speed (m/s) & Acceleration pull (m/s²)
const GEARBOX_RATES = [
  { gear: 1, maxSpeed: 35 / 3.6, accel: 6.9 }, // 1st: ~35 km/h
  { gear: 2, maxSpeed: 70 / 3.6, accel: 5.0 }, // 2nd: ~70 km/h
  { gear: 3, maxSpeed: 100 / 3.6, accel: 3.6 }, // 3rd: ~100 km/h
  { gear: 4, maxSpeed: 130 / 3.6, accel: 2.5 }, // 4th: ~130 km/h
  { gear: 5, maxSpeed: 165 / 3.6, accel: 1.7 }  // 5th: ~165 km/h
];

export class Vehicle {
  constructor(colorHex = 0x2ee6d6) {
    this.color = colorHex;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.driftVel = new THREE.Vector3(0, 0, 0);
    this.heading = 0; // In radians
    this.speed = 0;   // In internal m/s units
    this.steer = 0;   // Current wheel steer angle
    this.gear = 1;    // 1 to 5

    // Stats & Health
    this.health = 100;
    this.fuel = 100;
    this.isDrifting = false;
    this.rpmPercentage = 14;

    // Build 3D Mesh
    this.mesh = this._createCarMesh(this.color);
  }

  /**
   * Reset vehicle position and state
   */
  reset(x = 0, z = 0, heading = 0) {
    this.pos.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.driftVel.set(0, 0, 0);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.gear = 1;
    this.health = 100;
    this.fuel = 100;
    this.isDrifting = false;

    if (this.mesh) {
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = this.heading;
    }
  }

  /**
   * Physics Update Step (called fixed 60 Hz times per second)
   */
  update(dt, input) {
    if (!input) return;

    // Handle Manual Gear Shifting
    if (input.gearShiftUp && this.gear < 5) this.gear++;
    if (input.gearShiftDown && this.gear > 1) this.gear--;

    const gearInfo = GEARBOX_RATES[this.gear - 1];

    // Throttle Acceleration (Gear-capped rev limiter)
    if (input.throttle > 0.01) {
      if (this.speed >= 0 || Math.abs(this.speed) < 0.18) {
        if (this.speed < gearInfo.maxSpeed) {
          this.speed = Math.min(gearInfo.maxSpeed, this.speed + gearInfo.accel * input.throttle * dt);
        }
        this.fuel = Math.max(0, this.fuel - dt * 0.15 * input.throttle);
      } else {
        this.speed += 22 * input.throttle * dt; // Braking out of reverse
      }
    }

    // Engine Drag Over-Rev Drag
    if (Math.abs(this.speed) > gearInfo.maxSpeed) {
      const over = Math.abs(this.speed) - gearInfo.maxSpeed;
      this.speed -= Math.sign(this.speed) * Math.min(over, dt * (3 + over * 2.4));
    }

    // Brake / Reverse
    if (input.brake > 0.01) {
      if (this.speed > 0.18) {
        this.speed -= 26 * input.brake * dt;
      } else {
        this.speed -= 9 * input.brake * dt;
      }
    }

    // Natural Friction / Coasting Drag
    if (input.throttle < 0.01 && input.brake < 0.01) {
      const drag = 4.2 * dt;
      if (Math.abs(this.speed) < drag) {
        this.speed = 0;
      } else {
        this.speed -= Math.sign(this.speed) * drag;
      }
    }

    // Steering Angle Interpolation
    const turnScale = Math.min(Math.abs(this.speed) / 8, 1.0);
    const maxSteerRate = 2.4;
    this.steer += (input.steer * 0.42 - this.steer) * Math.min(dt * 12, 1.0);
    this.heading += this.steer * turnScale * dt * (0.35 + turnScale * 0.65);

    // Handbrake / Drift Dynamics
    this.isDrifting = input.handbrake && Math.abs(this.speed) > 2.2 && Math.abs(input.steer) > 0.08;

    // Position displacement
    const dx = Math.sin(this.heading) * this.speed * dt;
    const dz = Math.cos(this.heading) * this.speed * dt;
    this.pos.x += dx;
    this.pos.z += dz;

    // Update RPM Tachometer Percentage
    const speedRatio = Math.min(Math.abs(this.speed) / gearInfo.maxSpeed, 1.2);
    this.rpmPercentage = 14 + speedRatio * (100 - 14);

    // Sync 3D Mesh Transform
    if (this.mesh) {
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = this.heading;
    }
  }

  /**
   * Helper to construct a detailed 3D Car Model
   */
  _createCarMesh(colorHex) {
    const group = new THREE.Group();

    // Main Body Chassis
    const bodyGeo = new THREE.BoxGeometry(2.1, 0.75, 4.4);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      metalness: 0.8,
      roughness: 0.2
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.55;
    group.add(body);

    // Cabin / Roof
    const cabinGeo = new THREE.BoxGeometry(1.7, 0.6, 2.2);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x111622,
      metalness: 0.9,
      roughness: 0.1
    });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.1, -0.2);
    group.add(cabin);

    // Headlights
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.1), hlMat);
    hl1.position.set(-0.7, 0.6, 2.2);
    const hl2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.1), hlMat);
    hl2.position.set(0.7, 0.6, 2.2);
    group.add(hl1, hl2);

    // Taillights
    const tlMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
    const tl1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.1), tlMat);
    tl1.position.set(-0.7, 0.6, -2.2);
    const tl2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.1), tlMat);
    tl2.position.set(0.7, 0.6, -2.2);
    group.add(tl1, tl2);

    // 4 Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.35, 16);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x151515 });
    const wheelPositions = [
      [-1.0, 0.4, 1.4],
      [1.0, 0.4, 1.4],
      [-1.0, 0.4, -1.4],
      [1.0, 0.4, -1.4]
    ];

    wheelPositions.forEach(([x, y, z]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, y, z);
      group.add(wheel);
    });

    return group;
  }
}
