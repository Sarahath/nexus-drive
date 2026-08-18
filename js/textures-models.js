"use strict";
/* ─── PHOTOREALISTIC PROCEDURAL TEXTURES & CAR MODELS ───────────────────── */

function mkTex(fn, w=1024, h=1024, rx=1, ry=1){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 16;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  return t;
}

const T = {
  // High-Resolution Highway Asphalt with Double Yellow Center Lines & White Lane Markings
  road: mkTex((c, w, h) => {
    // Dark Asphalt Base
    c.fillStyle = '#1e2126';
    c.fillRect(0, 0, w, h);

    // Asphalt Texture Noise / Granularity
    for (let i = 0; i < 3000; i++) {
      c.fillStyle = `rgba(${30 + Math.random() * 30 | 0}, ${35 + Math.random() * 30 | 0}, ${40 + Math.random() * 30 | 0}, 0.35)`;
      c.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }

    // Concrete Sidewalk Curbs on Left & Right Edges
    c.fillStyle = '#7a828e';
    c.fillRect(0, 0, 32, h);
    c.fillRect(w - 32, 0, 32, h);
    c.fillStyle = '#4a5058';
    c.fillRect(30, 0, 4, h);
    c.fillRect(w - 34, 0, 4, h);

    // Double Solid Yellow Center Line
    c.fillStyle = '#ffcc00';
    c.fillRect(w / 2 - 12, 0, 8, h);
    c.fillRect(w / 2 + 4, 0, 8, h);

    // Outer Solid White Shoulder Lines
    c.fillStyle = '#ffffff';
    c.fillRect(48, 0, 10, h);
    c.fillRect(w - 58, 0, 10, h);

    // Inner White Dashed Lane Lines
    c.fillStyle = 'rgba(255, 255, 255, 0.9)';
    for (let y = 0; y < h; y += 128) {
      c.fillRect(w * 0.28 - 4, y, 8, 72);
      c.fillRect(w * 0.72 - 4, y, 8, 72);
    }
  }, 1024, 1024, CFG.grid, CFG.grid * 4),

  sw: mkTex((c, w, h) => {
    c.fillStyle = '#737a85';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 4;
    for (let i = 0; i <= 8; i++) {
      c.beginPath(); c.moveTo(i * w / 8, 0); c.lineTo(i * w / 8, h); c.stroke();
    }
  }, 256, 256, 6, 6),

  grass: mkTex((c, w, h) => {
    c.fillStyle = '#224825';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 800; i++) {
      c.fillStyle = `rgba(${30 + Math.random() * 45 | 0}, ${75 + Math.random() * 55 | 0}, 30, 0.75)`;
      c.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
  }, 256, 256, 6, 6),

  win: mkTex((c, w, h) => {
    c.fillStyle = '#0a101d';
    c.fillRect(0, 0, w, h);
    const cols = 8, rows = 14;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lit = Math.random() > 0.45;
        c.fillStyle = lit ? `rgba(255, ${200 + Math.random() * 45 | 0}, 120, 0.7)` : 'rgba(12, 22, 40, 0.95)';
        c.fillRect(x * (w / cols) + 4, y * (h / rows) + 4, w / cols - 8, h / rows - 8);
      }
    }
  }, 128, 256)
};

const CAR_VARIANTS = {
  suv:   { chH: .42, cabH: .35 },
  sedan: { chH: .42, cabH: .35 },
  van:   { chH: .42, cabH: .35 },
  sport: { chH: .42, cabH: .35 },
};

/**
 * High-Detail Sports Supercar Model Generator (Matching Reference Images)
 */
function mkCar(col = 0xee2233, variant = 'sport', withLights = true) {
  const g = new THREE.Group();
  g.name = 'car';
  g.userData.variant = variant;

  // Use vibrant red or custom color with metallic gloss reflection
  const bodyColor = (col === 0x2ee6d6 || !col) ? 0xee2233 : col;

  const pM = new THREE.MeshStandardMaterial({
    color: bodyColor,
    metalness: 0.88,
    roughness: 0.12
  });
  const dM = new THREE.MeshStandardMaterial({
    color: 0x0a0d12,
    metalness: 0.6,
    roughness: 0.3
  });
  const glM = new THREE.MeshStandardMaterial({
    color: 0x050810,
    metalness: 0.95,
    roughness: 0.05,
    transparent: true,
    opacity: 0.88
  });
  const crM = new THREE.MeshStandardMaterial({
    color: 0xebf2f8,
    metalness: 0.98,
    roughness: 0.05
  });
  const stripeM = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.7,
    roughness: 0.2
  });
  const hlM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const tlM = new THREE.MeshBasicMaterial({ color: 0xff1a1a });

  function box(sx, sy, sz, mat, px, py, pz, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(px, py, pz);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }

  // Aerodynamic Low-Slung Sports Car Body Chassis
  box(2.05, 0.44, 4.6, pM, 0, 0.36, 0);                 // Main Chassis Body
  box(1.94, 0.26, 1.9, pM, 0, 0.64, 1.15, -0.14);       // Sloped Hood
  box(1.64, 0.52, 2.1, glM, 0, 0.78, -0.2);             // Tinted Glass Cabin
  box(1.62, 0.05, 1.3, pM, 0, 1.05, -0.2);             // Roof Panel

  // Twin White Racing Stripes down the Hood & Roof (Matching Reference Image)
  box(0.24, 0.02, 4.5, stripeM, -0.24, 0.59, 0);
  box(0.24, 0.02, 4.5, stripeM, 0.24, 0.59, 0);

  // Aerodynamic Front Bumper Splitter & Side Skirts
  box(2.08, 0.22, 0.38, dM, 0, 0.22, 2.3);
  box(2.08, 0.22, 0.38, dM, 0, 0.22, -2.3);
  box(2.14, 0.14, 3.3, dM, 0, 0.18, 0);

  // Rear Racing Wing / Spoiler
  box(1.9, 0.06, 0.38, dM, 0, 1.14, -2.18);
  box(0.12, 0.36, 0.2, dM, -0.72, 0.94, -2.18);
  box(0.12, 0.36, 0.2, dM, 0.72, 0.94, -2.18);

  // Sleek LED Headlights & Taillights
  [-0.72, 0.72].forEach(x => {
    box(0.38, 0.12, 0.08, hlM, x, 0.46, 2.31);
    box(0.38, 0.12, 0.08, tlM, x, 0.48, -2.31);
  });

  // Sports Car Alloy Wheels (4 Wheels)
  const wheels = [], front = [];
  [
    [-1.0, 0.34, 1.4],
    [1.0, 0.34, 1.4],
    [-1.0, 0.34, -1.4],
    [1.0, 0.34, -1.4]
  ].forEach((p, i) => {
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.34, 18), dM);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 12), crM);
    rim.rotation.z = Math.PI / 2;

    // 5 Alloy Spokes
    for (let s = 0; s < 5; s++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.04), crM);
      sp.rotation.z = s * Math.PI / 5;
      sp.rotation.x = Math.PI / 2;
      rim.add(sp);
    }

    wg.add(tire, rim);
    wg.position.set(...p);
    g.add(wg);
    wheels.push(wg);
    if (i < 2) front.push(wg);
  });

  g.userData = { wheels, front, pM, hlM, setCol: c => pM.color.set(c) };
  return g;
}
