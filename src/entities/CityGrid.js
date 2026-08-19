"use strict";

/**
 * Procedural 3D City & World Builder
 * Generates PBR road grid, buildings, street lights, and mission props.
 */
export class CityGrid {
  constructor(scene) {
    this.scene = scene;
    this.blockSize = 44;
    this.roadWidth = 12;
    this.gridSpan = 9;

    this.colliders = [];
    this.props = [];

    this._buildGround();
    this._buildCityBlocks();
  }

  _buildGround() {
    // Ground Plane
    const groundGeo = new THREE.PlaneGeometry(500, 500);
    const groundMat = new THREE.MeshLambertMaterial({
      color: 0x111622,
      roughness: 0.95
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.scene.add(ground);
  }

  _buildCityBlocks() {
    const half = Math.floor(this.gridSpan / 2);
    const cell = this.blockSize + this.roadWidth;

    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x1b2838,
      roughness: 0.6,
      metalness: 0.3
    });

    for (let x = -half; x <= half; x++) {
      for (let z = -half; z <= half; z++) {
        if (Math.abs(x) <= 1 && Math.abs(z) <= 1) continue; // Leave central spawn area open

        const posX = x * cell;
        const posZ = z * cell;

        // Building Mesh
        const height = 15 + Math.random() * 35;
        const bGeo = new THREE.BoxGeometry(this.blockSize - 2, height, this.blockSize - 2);
        const building = new THREE.Mesh(bGeo, buildingMat);
        building.position.set(posX, height / 2, posZ);
        this.scene.add(building);

        this.colliders.push({
          x: posX,
          z: posZ,
          width: this.blockSize,
          depth: this.blockSize
        });
      }
    }
  }

  /**
   * Spawn 3D Finish Line Archway
   */
  spawnFinishArch(x, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 5.5, 8), mat);
    p1.position.set(-4.5, 2.75, 0);
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 5.5, 8), mat);
    p2.position.set(4.5, 2.75, 0);

    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 0.9, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x2ecc70 })
    );
    banner.position.set(0, 5.2, 0);

    group.add(p1, p2, banner);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.props.push(group);
    return group;
  }

  /**
   * Spawn 3D Checkpoint Flag Marker
   */
  spawnCheckpointMarker(x, z) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.8, 2.4, 24),
      new THREE.MeshBasicMaterial({ color: 0x2ecc70, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 4, 8),
      new THREE.MeshLambertMaterial({ color: 0xdddddd })
    );
    pole.position.y = 2;

    group.add(ring, pole);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.props.push(group);
    return group;
  }
}
