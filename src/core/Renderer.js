"use strict";

/**
 * Professional WebGL 3D Renderer Manager
 * Handles Three.js Scene, Camera Rigs, Shaders, Adaptive Pixel Ratio, and Dynamic Lighting.
 */
export class RendererManager {
  constructor(canvasElement) {
    this.canvas = canvasElement || document.getElementById('c');
    
    // Core Three.js Objects
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 800);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });

    // Adaptive Performance Settings
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.curPixelRatio = this.basePixelRatio;
    
    this._initRendererSettings();
    this._setupLighting();
    this._setupEnvironment();
    this._bindResize();
  }

  _initRendererSettings() {
    this.renderer.setPixelRatio(this.curPixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = false;
  }

  _setupLighting() {
    // Directional Sun Light
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sunLight.position.set(60, 100, 40);
    this.scene.add(this.sunLight);

    // Ambient & Hemisphere Lighting
    this.ambientLight = new THREE.AmbientLight(0x9fb3c8, 0.4);
    this.hemiLight = new THREE.HemisphereLight(0x9fc4e8, 0x33301f, 0.4);
    this.scene.add(this.ambientLight, this.hemiLight);
  }

  _setupEnvironment() {
    this.scene.background = new THREE.Color(0x0c1820);
    this.scene.fog = new THREE.FogExp2(0x9fc4e8, 0.003);

    // Procedural Gradient Sky Dome Shader
    const skyGeo = new THREE.SphereGeometry(600, 16, 10);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0.12, 0.35, 0.65) },
        bottomColor: { value: new THREE.Color(0.75, 0.88, 1.0) }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y * 0.5 + 0.5;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(h, 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });

    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
  }

  /**
   * Smooth 3rd-person chase camera controller
   */
  updateChaseCamera(targetPosition, headingAngle, speed, dt) {
    const distance = 8.5 + Math.min(speed / 20, 2.5);
    const height = 3.2 + Math.min(speed / 30, 0.8);

    const targetCamX = targetPosition.x - Math.sin(headingAngle) * distance;
    const targetCamZ = targetPosition.z - Math.cos(headingAngle) * distance;
    const targetCamY = targetPosition.y + height;

    // Smooth interpolation
    const lerpFactor = Math.min(dt * 8, 1.0);
    this.camera.position.x += (targetCamX - this.camera.position.x) * lerpFactor;
    this.camera.position.y += (targetCamY - this.camera.position.y) * lerpFactor;
    this.camera.position.z += (targetCamZ - this.camera.position.z) * lerpFactor;

    const lookTargetX = targetPosition.x + Math.sin(headingAngle) * 4;
    const lookTargetY = targetPosition.y + 1.2;
    const lookTargetZ = targetPosition.z + Math.cos(headingAngle) * 4;

    this.camera.lookAt(lookTargetX, lookTargetY, lookTargetZ);
  }

  /**
   * Render frame
   */
  render() {
    this.renderer.render(this.scene, this.camera);
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
  }
}
