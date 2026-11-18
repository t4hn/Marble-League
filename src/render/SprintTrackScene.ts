import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {SPRINT_PHYSICS_CONFIG} from '../engine/sprintConfig';
import {
  getSprintLaneCenterX,
  getSprintTrackSurfaceY,
  LiveMarbleState,
  MARBLE_RADIUS,
  SprintCompetitorInput,
} from '../engine/sprintSimulation';
import {SprintLayoutConfig, Venue} from '../types/league';
import {
  createCheckeredTexture,
  createContactShadowTexture,
  createMarbleSwirlTexture,
  createTrackBumpTexture,
  createTrackSurfaceTexture,
} from './textures';

export type CameraViewMode = 'broadcast' | 'overhead' | 'finish' | 'gate';

interface MarbleRig {
  marbleId: string;
  group: THREE.Group;
  innerCore: THREE.Mesh;
  outerGlass: THREE.Mesh;
  shadowDisc: THREE.Mesh;
  lane: number;
}

// Pre-allocated scratch objects to guarantee zero GC allocations in render loop
const _camTargetPos = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _curLookTarget = new THREE.Vector3(0, 1, 10);
const _quatScratch = new THREE.Quaternion();
const _prevQuatScratch = new THREE.Quaternion();
const _dummyMat = new THREE.Matrix4();
const _dummyPos = new THREE.Vector3();
const _dummyQuat = new THREE.Quaternion();
const _dummyScale = new THREE.Vector3(1, 1, 1);
const _dummyColor = new THREE.Color();

export function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class SprintTrackScene {
  public readonly isSoftwareGl: boolean;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;

  private readonly container: HTMLElement;
  private readonly config: SprintLayoutConfig;
  private readonly marbleRigs = new Map<string, MarbleRig>();
  private readonly disposables: Array<{dispose: () => void}> = [];

  private gateBarGroup!: THREE.Group;
  private gateLamps: THREE.Mesh[] = [];
  private keyLight!: THREE.DirectionalLight;
  private cameraMode: CameraViewMode = 'broadcast';
  private gateClosedY = 0;

  private frameId = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    venue: Venue,
    competitors: SprintCompetitorInput[],
  ) {
    this.container = container;
    this.config = venue.sprintConfig!;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(320, container.clientWidth || window.innerWidth);
    const height = Math.max(240, container.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.dataset.testid = 'sprint-webgl-canvas';

    container.appendChild(this.renderer.domElement);

    const isTwilight = venue.theme === 'twilight-floodlit';
    const horizonHex = isTwilight ? 0x101726 : 0xcbd8e6;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(horizonHex);
    this.scene.fog = new THREE.FogExp2(horizonHex, isTwilight ? 0.0085 : 0.0068);

    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.2, 320);
    this.camera.position.set(6.5, 4.8, -5.5);
    _curLookTarget.set(0, getSprintTrackSurfaceY(6, this.config), 6);
    this.camera.lookAt(_curLookTarget);

    // Mandatory RoomEnvironment PMREM studio reflections on every device
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.disposables.push(envTex);
    pmrem.dispose();

    this.setupLighting(isTwilight);
    this.buildStadiumAndTrack(venue, isTwilight);
    this.buildMarbles(competitors);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
  }

  private setupLighting(isTwilight: boolean): void {
    // Warm directional key light + cool HemisphereLight fill
    const hemi = new THREE.HemisphereLight(
      isTwilight ? 0x5c7aa8 : 0xdbeafe,
      isTwilight ? 0x1b202b : 0x475569,
      isTwilight ? 0.9 : 1.05,
    );
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(isTwilight ? 0xffe4c4 : 0xfff3e0, isTwilight ? 2.1 : 2.35);
    key.position.set(18, 28, 12);
    key.castShadow = !this.isSoftwareGl;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 110;
    const d = 28;
    key.shadow.camera.left = -d;
    key.shadow.camera.right = d;
    key.shadow.camera.top = d;
    key.shadow.camera.bottom = -d;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    this.scene.add(key.target);
    this.keyLight = key;

    // Cool rim light from behind finish arch
    const rim = new THREE.DirectionalLight(0x93c5fd, 0.85);
    rim.position.set(-14, 12, this.config.trackLengthMeters + 16);
    this.scene.add(rim);
  }

  private buildStadiumAndTrack(venue: Venue, isTwilight: boolean): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const cfg = this.config;
    const totalWidth = cfg.laneWidthMeters * 8 + 0.6;
    const rampRad = (cfg.rampSlopeDegrees * Math.PI) / 180;
    const mainRad = (cfg.mainSlopeDegrees * Math.PI) / 180;

    // Extended surrounding stadium infield terrain (never floating in empty void)
    const groundGeo = new THREE.PlaneGeometry(340, 340);
    const groundMat = new THREE.MeshStandardMaterial({
      color: isTwilight ? 0x0f1622 : 0x8d9aa8,
      roughness: 0.92,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, getSprintTrackSurfaceY(cfg.trackLengthMeters, cfg) - 1.8, cfg.trackLengthMeters * 0.5);
    ground.receiveShadow = !this.isSoftwareGl;
    this.scene.add(ground);
    this.disposables.push(groundGeo, groundMat);

    // Track surface material with procedural lane markings & bump micro-relief
    const trackTex = createTrackSurfaceTexture(isTwilight, maxAniso);
    const bumpTex = createTrackBumpTexture(maxAniso);
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: trackTex,
      bumpMap: bumpTex,
      bumpScale: 0.012,
      roughness: 0.34,
      metalness: 0.12,
    });
    this.disposables.push(trackTex, bumpTex, trackMat);

    const railMetalMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.25,
      metalness: 0.85,
    });
    const dividerGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe2e8f0,
      roughness: 0.14,
      metalness: 0.05,
      clearcoat: 0.9,
      transparent: true,
      opacity: 0.45,
    });
    const darkStructuralMat = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.68,
      metalness: 0.35,
    });
    const goldTrimMat = new THREE.MeshStandardMaterial({
      color: 0xe5a93c,
      roughness: 0.28,
      metalness: 0.82,
    });
    this.disposables.push(railMetalMat, dividerGlassMat, darkStructuralMat, goldTrimMat);

    // 1. Ramp deck & main straightaway deck
    const rampSpan = cfg.rampLengthMeters + 3.0;
    const rampHyp = rampSpan / Math.cos(rampRad);
    const rampCenterZ = (cfg.rampLengthMeters - 3.0) / 2;
    const rampCenterY = getSprintTrackSurfaceY(rampCenterZ, cfg) - 0.3 * Math.cos(rampRad);

    const rampGeo = new THREE.BoxGeometry(totalWidth, 0.6, rampHyp + 0.3);
    const rampMesh = new THREE.Mesh(rampGeo, trackMat);
    rampMesh.position.set(0, rampCenterY, rampCenterZ);
    rampMesh.rotation.x = rampRad;
    rampMesh.receiveShadow = !this.isSoftwareGl;
    this.scene.add(rampMesh);
    this.disposables.push(rampGeo);

    const mainEndZ = cfg.trackLengthMeters + 16;
    const mainSpan = mainEndZ - cfg.rampLengthMeters;
    const mainHyp = mainSpan / Math.cos(mainRad);
    const mainCenterZ = cfg.rampLengthMeters + mainSpan / 2;
    const mainCenterY = getSprintTrackSurfaceY(mainCenterZ, cfg) - 0.3 * Math.cos(mainRad);

    const mainGeo = new THREE.BoxGeometry(totalWidth, 0.6, mainHyp + 0.3);
    const mainMesh = new THREE.Mesh(mainGeo, trackMat);
    mainMesh.position.set(0, mainCenterY, mainCenterZ);
    mainMesh.rotation.x = mainRad;
    mainMesh.receiveShadow = !this.isSoftwareGl;
    this.scene.add(mainMesh);
    this.disposables.push(mainGeo);

    // Track under-structure concrete viaduct spine (composite grounding so track never floats)
    const spineHeight = 5.0;
    const spineGeo = new THREE.BoxGeometry(totalWidth - 0.8, spineHeight, mainHyp);
    const spineMesh = new THREE.Mesh(spineGeo, darkStructuralMat);
    spineMesh.position.set(0, mainCenterY - spineHeight / 2 - 0.25, mainCenterZ);
    spineMesh.rotation.x = mainRad;
    this.scene.add(spineMesh);
    this.disposables.push(spineGeo);

    // 2. Full-length outer metal guard rails + launch-chute inner polycarbonate dividers
    const chuteExt = SPRINT_PHYSICS_CONFIG.track.launchChuteExtensionMeters;
    const chuteMainCenterZ = cfg.rampLengthMeters + chuteExt / 2;
    const chuteMainHyp = chuteExt / Math.cos(mainRad);

    const outerRailGeo = new THREE.BoxGeometry(0.16, 0.44, mainHyp + 0.3);
    const outerRampRailGeo = new THREE.BoxGeometry(0.16, 0.44, rampHyp + 0.3);
    const outerGlassGeo = new THREE.BoxGeometry(0.05, 0.36, mainHyp + 0.3);
    const outerRampGlassGeo = new THREE.BoxGeometry(0.05, 0.36, rampHyp + 0.3);
    const innerRampRailGeo = new THREE.BoxGeometry(0.05, 0.28, rampHyp + 0.1);
    const innerChuteExtGeo = new THREE.BoxGeometry(0.05, 0.28, chuteMainHyp);
    const endPostGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.32, 10);
    this.disposables.push(
      outerRailGeo,
      outerRampRailGeo,
      outerGlassGeo,
      outerRampGlassGeo,
      innerRampRailGeo,
      innerChuteExtGeo,
      endPostGeo,
    );

    for (let i = 0; i <= 8; i++) {
      const isOuter = i === 0 || i === 8;
      if (isOuter) {
        const wallX = (i - 4) * cfg.laneWidthMeters + (i === 0 ? -0.04 : 0.04);
        const mMain = new THREE.Mesh(outerRailGeo, railMetalMat);
        mMain.position.set(wallX, getSprintTrackSurfaceY(mainCenterZ, cfg) + 0.18, mainCenterZ);
        mMain.rotation.x = mainRad;
        this.scene.add(mMain);

        const mRamp = new THREE.Mesh(outerRampRailGeo, railMetalMat);
        mRamp.position.set(wallX, getSprintTrackSurfaceY(rampCenterZ, cfg) + 0.18, rampCenterZ);
        mRamp.rotation.x = rampRad;
        this.scene.add(mRamp);

        const gMainGlass = new THREE.Mesh(outerGlassGeo, dividerGlassMat);
        gMainGlass.position.set(wallX, getSprintTrackSurfaceY(mainCenterZ, cfg) + 0.56, mainCenterZ);
        gMainGlass.rotation.x = mainRad;
        this.scene.add(gMainGlass);

        const gRampGlass = new THREE.Mesh(outerRampGlassGeo, dividerGlassMat);
        gRampGlass.position.set(wallX, getSprintTrackSurfaceY(rampCenterZ, cfg) + 0.56, rampCenterZ);
        gRampGlass.rotation.x = rampRad;
        this.scene.add(gRampGlass);
      } else {
        const dividerX = (i - 4) * cfg.laneWidthMeters;
        const mRamp = new THREE.Mesh(innerRampRailGeo, dividerGlassMat);
        mRamp.position.set(dividerX, getSprintTrackSurfaceY(rampCenterZ, cfg) + 0.1, rampCenterZ);
        mRamp.rotation.x = rampRad;
        this.scene.add(mRamp);

        if (chuteExt > 0.05) {
          const mExt = new THREE.Mesh(innerChuteExtGeo, dividerGlassMat);
          mExt.position.set(
            dividerX,
            getSprintTrackSurfaceY(chuteMainCenterZ, cfg) + 0.1,
            chuteMainCenterZ,
          );
          mExt.rotation.x = mainRad;
          this.scene.add(mExt);
        }

        const chuteEndZ = cfg.rampLengthMeters + chuteExt;
        const post = new THREE.Mesh(endPostGeo, railMetalMat);
        post.position.set(dividerX, getSprintTrackSurfaceY(chuteEndZ, cfg) + 0.14, chuteEndZ);
        this.scene.add(post);
      }
    }

    // 3. Checkered Finish Line strip offset +0.02m above deck
    const checkerTex = createCheckeredTexture(maxAniso);
    const finishStripMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: checkerTex,
      roughness: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const finishStripGeo = new THREE.PlaneGeometry(totalWidth - 0.4, 1.1);
    const finishStrip = new THREE.Mesh(finishStripGeo, finishStripMat);
    finishStrip.position.set(0, getSprintTrackSurfaceY(cfg.trackLengthMeters, cfg) + 0.025, cfg.trackLengthMeters);
    finishStrip.rotation.x = -Math.PI / 2 + mainRad;
    this.scene.add(finishStrip);
    this.disposables.push(checkerTex, finishStripMat, finishStripGeo);

    // 4. Composite Multi-Part Starting Gate Assembly (Pylons + Crossbeam + Light Pods + Lift Bar)
    const startY = getSprintTrackSurfaceY(0.32, cfg);
    const startGateGroup = new THREE.Group();
    startGateGroup.position.set(0, startY, 0.32);

    const pillarGeo = new THREE.BoxGeometry(0.45, 3.4, 0.45);
    const beamGeo = new THREE.BoxGeometry(totalWidth + 1.4, 0.45, 0.55);
    const lampHousingGeo = new THREE.BoxGeometry(1.8, 0.5, 0.3);
    const lampBulbGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.12, 16);
    const gatePlankGeo = new THREE.BoxGeometry(totalWidth - 0.25, 0.42, 0.09);
    this.disposables.push(pillarGeo, beamGeo, lampHousingGeo, lampBulbGeo, gatePlankGeo);

    const leftPillar = new THREE.Mesh(pillarGeo, darkStructuralMat);
    leftPillar.position.set(-totalWidth / 2 - 0.35, 1.7, 0);
    const rightPillar = new THREE.Mesh(pillarGeo, darkStructuralMat);
    rightPillar.position.set(totalWidth / 2 + 0.35, 1.7, 0);
    const topBeam = new THREE.Mesh(beamGeo, darkStructuralMat);
    topBeam.position.set(0, 3.2, 0);
    const lampHousing = new THREE.Mesh(lampHousingGeo, railMetalMat);
    lampHousing.position.set(0, 3.2, 0.28);
    startGateGroup.add(leftPillar, rightPillar, topBeam, lampHousing);

    this.gateLamps = [];
    for (let l = 0; l < 3; l++) {
      const lampMat = new THREE.MeshStandardMaterial({
        color: l === 0 ? 0xef4444 : l === 1 ? 0xf59e0b : 0x10b981,
        emissive: l === 0 ? 0xef4444 : 0x000000,
        emissiveIntensity: l === 0 ? 1.6 : 0.0,
        roughness: 0.2,
      });
      this.disposables.push(lampMat);
      const bulb = new THREE.Mesh(lampBulbGeo, lampMat);
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set((l - 1) * 0.48, 3.2, 0.42);
      startGateGroup.add(bulb);
      this.gateLamps.push(bulb);
    }

    this.gateBarGroup = new THREE.Group();
    this.gateClosedY = 0.24;
    this.gateBarGroup.position.set(0, this.gateClosedY, 0);
    const gatePlank = new THREE.Mesh(gatePlankGeo, goldTrimMat);
    this.gateBarGroup.add(gatePlank);
    startGateGroup.add(this.gateBarGroup);
    this.scene.add(startGateGroup);

    // 5. Composite Multi-Part Finish Arch & Distance Gantries
    const finishGroup = new THREE.Group();
    finishGroup.position.set(0, getSprintTrackSurfaceY(cfg.trackLengthMeters, cfg), cfg.trackLengthMeters);
    const fPillarGeo = new THREE.BoxGeometry(0.55, 4.4, 0.7);
    const fBeamGeo = new THREE.BoxGeometry(totalWidth + 1.8, 0.75, 0.85);
    const fBannerGeo = new THREE.BoxGeometry(totalWidth + 0.6, 0.55, 0.9);
    const fCapGeo = new THREE.BoxGeometry(0.75, 0.25, 0.9);
    this.disposables.push(fPillarGeo, fBeamGeo, fBannerGeo, fCapGeo);

    const fLeft = new THREE.Mesh(fPillarGeo, darkStructuralMat);
    fLeft.position.set(-totalWidth / 2 - 0.45, 2.2, 0);
    const fRight = new THREE.Mesh(fPillarGeo, darkStructuralMat);
    fRight.position.set(totalWidth / 2 + 0.45, 2.2, 0);
    const fTop = new THREE.Mesh(fBeamGeo, darkStructuralMat);
    fTop.position.set(0, 4.2, 0);
    const fBanner = new THREE.Mesh(fBannerGeo, finishStripMat);
    fBanner.position.set(0, 4.2, 0);
    const fCapL = new THREE.Mesh(fCapGeo, goldTrimMat);
    fCapL.position.set(-totalWidth / 2 - 0.45, 4.55, 0);
    const fCapR = new THREE.Mesh(fCapGeo, goldTrimMat);
    fCapR.position.set(totalWidth / 2 + 0.45, 4.55, 0);
    finishGroup.add(fLeft, fRight, fTop, fBanner, fCapL, fCapR);
    this.scene.add(finishGroup);

    // Intermediate distance marker gantries every 20m (composite 3-part portals)
    const gPostGeo = new THREE.CylinderGeometry(0.1, 0.12, 3.1, 10);
    const gSpanGeo = new THREE.BoxGeometry(totalWidth + 0.9, 0.22, 0.24);
    this.disposables.push(gPostGeo, gSpanGeo);
    for (let zMark = 20; zMark < cfg.trackLengthMeters - 5; zMark += 20) {
      const yMark = getSprintTrackSurfaceY(zMark, cfg);
      const gantry = new THREE.Group();
      gantry.position.set(0, yMark, zMark);
      const pL = new THREE.Mesh(gPostGeo, railMetalMat);
      pL.position.set(-totalWidth / 2 - 0.25, 1.55, 0);
      const pR = new THREE.Mesh(gPostGeo, railMetalMat);
      pR.position.set(totalWidth / 2 + 0.25, 1.55, 0);
      const span = new THREE.Mesh(gSpanGeo, darkStructuralMat);
      span.position.set(0, 3.05, 0);
      gantry.add(pL, pR, span);
      this.scene.add(gantry);
    }

    // 6. Tiered Stadium Grandstands & Instanced Spectators along main straightaway flanks
    const standMat = new THREE.MeshStandardMaterial({
      color: isTwilight ? 0x1e293b : 0x334155,
      roughness: 0.85,
      metalness: 0.1,
    });
    const standStartZ = cfg.rampLengthMeters + 2;
    const standEndZ = cfg.trackLengthMeters + 10;
    const standLen = standEndZ - standStartZ;
    const standMidZ = (standStartZ + standEndZ) / 2;
    const standMidY = getSprintTrackSurfaceY(standMidZ, cfg);
    const standTierGeo = new THREE.BoxGeometry(3.2, 0.9, standLen);
    this.disposables.push(standMat, standTierGeo);

    for (const side of [-1, 1]) {
      for (let tier = 0; tier < 4; tier++) {
        const tierMesh = new THREE.Mesh(standTierGeo, standMat);
        tierMesh.position.set(
          side * (totalWidth / 2 + 6.5 + tier * 2.8),
          standMidY - 0.6 + tier * 1.1,
          standMidZ,
        );
        tierMesh.rotation.x = mainRad;
        this.scene.add(tierMesh);
      }
    }

    // Instanced spectators seated cleanly flush on each grandstand tier
    const spectatorCount = 224;
    const specGeo = new THREE.SphereGeometry(0.18, 10, 8);
    const specMat = new THREE.MeshStandardMaterial({roughness: 0.55, metalness: 0.08});
    const specMesh = new THREE.InstancedMesh(specGeo, specMat, spectatorCount);
    const teamPalette = [0x10b981, 0x1e3a8a, 0xea580c, 0x7c3aed, 0xdc2626, 0x0d9488, 0xd97706, 0x2563eb];
    for (let i = 0; i < spectatorCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const tier = i % 4;
      const zPos = standStartZ + 1.5 + ((i * 3.71) % (standLen - 3));
      const xPos = side * (totalWidth / 2 + 6.0 + tier * 2.8 + ((i % 3) - 1) * 0.42);
      const tierCenterY = standMidY - 0.6 + tier * 1.1 - (zPos - standMidZ) * Math.tan(mainRad);
      const yPos = tierCenterY + 0.56;
      _dummyPos.set(xPos, yPos, zPos);
      _dummyScale.setScalar(0.88 + (i % 4) * 0.06);
      _dummyMat.compose(_dummyPos, _dummyQuat, _dummyScale);
      specMesh.setMatrixAt(i, _dummyMat);
      _dummyColor.setHex(teamPalette[i % teamPalette.length]);
      specMesh.setColorAt(i, _dummyColor);
    }
    specMesh.instanceMatrix.needsUpdate = true;
    if (specMesh.instanceColor) specMesh.instanceColor.needsUpdate = true;
    specMesh.computeBoundingSphere();
    this.scene.add(specMesh);
    this.disposables.push(specGeo, specMat);

    // Stadium floodlight towers (composite 3-part masts)
    const mastGeo = new THREE.CylinderGeometry(0.22, 0.35, 16, 8);
    const headGeo = new THREE.BoxGeometry(2.6, 1.1, 0.6);
    const emissivePanelGeo = new THREE.PlaneGeometry(2.3, 0.85);
    const floodEmissiveMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: isTwilight ? 0xfef3c7 : 0xfffbeb,
      emissiveIntensity: isTwilight ? 2.2 : 0.8,
      roughness: 0.2,
    });
    this.disposables.push(mastGeo, headGeo, emissivePanelGeo, floodEmissiveMat);

    for (const side of [-1, 1]) {
      for (const zFrac of [0.15, 0.55, 0.92]) {
        const zTower = cfg.trackLengthMeters * zFrac;
        const yBase = getSprintTrackSurfaceY(zTower, cfg) - 1.5;
        const tower = new THREE.Group();
        tower.position.set(side * (totalWidth / 2 + 17.5), yBase, zTower);
        const mast = new THREE.Mesh(mastGeo, darkStructuralMat);
        mast.position.y = 8;
        const head = new THREE.Mesh(headGeo, railMetalMat);
        head.position.set(0, 16.2, 0);
        head.lookAt(side < 0 ? 12 : -12, 6, 0);
        const panel = new THREE.Mesh(emissivePanelGeo, floodEmissiveMat);
        panel.position.set(0, 0, 0.32);
        head.add(panel);
        tower.add(mast, head);
        this.scene.add(tower);
      }
    }
  }

  private buildMarbles(competitors: SprintCompetitorInput[]): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const outerGeo = new THREE.SphereGeometry(MARBLE_RADIUS, 28, 20);
    const innerGeo = new THREE.SphereGeometry(MARBLE_RADIUS * 0.78, 22, 16);
    const vaneGeo = new THREE.TorusGeometry(MARBLE_RADIUS * 0.44, MARBLE_RADIUS * 0.14, 10, 22);
    const shadowGeo = new THREE.CircleGeometry(MARBLE_RADIUS * 1.18, 20);
    const shadowTex = createContactShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.disposables.push(outerGeo, innerGeo, vaneGeo, shadowGeo, shadowTex, shadowMat);

    for (const comp of competitors) {
      const group = new THREE.Group();

      // Inner swirled glass core
      const swirlTex = createMarbleSwirlTexture(
        comp.team.primaryColor,
        comp.team.secondaryColor,
        comp.team.accentColor,
        maxAniso,
      );
      const innerMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: swirlTex,
        roughness: 0.24,
        metalness: 0.12,
      });
      const innerCore = new THREE.Mesh(innerGeo, innerMat);
      innerCore.castShadow = !this.isSoftwareGl;

      // Internal twisted metallic accent vane inside core
      const vaneMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(comp.team.accentColor),
        roughness: 0.18,
        metalness: 0.75,
      });
      const vane = new THREE.Mesh(vaneGeo, vaneMat);
      vane.rotation.set(Math.PI / 3, Math.PI / 5, 0);
      innerCore.add(vane);

      // Outer crystal glass shell (physical clearcoat + software-GL fallback opacity)
      const outerMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.04,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        ior: 1.54,
        envMapIntensity: 1.45,
        transparent: true,
        opacity: this.isSoftwareGl ? 0.38 : 0.28,
        depthWrite: false,
      });
      const outerGlass = new THREE.Mesh(outerGeo, outerMat);
      outerGlass.renderOrder = 2;

      group.add(innerCore, outerGlass);
      const laneX = getSprintLaneCenterX(comp.lane, this.config.laneWidthMeters);
      group.position.set(
        laneX,
        getSprintTrackSurfaceY(-0.3, this.config) + MARBLE_RADIUS + 0.005,
        -0.3,
      );
      this.scene.add(group);

      // Grounded radial contact shadow disc
      const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
      shadowDisc.rotation.x = -Math.PI / 2;
      shadowDisc.position.set(laneX, getSprintTrackSurfaceY(-0.3, this.config) + 0.014, -0.3);
      this.scene.add(shadowDisc);

      this.disposables.push(swirlTex, innerMat, vaneMat, outerMat);

      this.marbleRigs.set(comp.marble.id, {
        marbleId: comp.marble.id,
        group,
        innerCore,
        outerGlass,
        shadowDisc,
        lane: comp.lane,
      });
    }
  }

  public setCameraMode(mode: CameraViewMode): void {
    this.cameraMode = mode;
  }

  public setGateLampState(phase: 'ready' | 'countdown1' | 'countdown2' | 'go'): void {
    this.gateLamps.forEach((lamp, idx) => {
      const mat = lamp.material as THREE.MeshStandardMaterial;
      if (phase === 'ready') {
        mat.emissive.setHex(idx === 0 ? 0xef4444 : 0x000000);
        mat.emissiveIntensity = idx === 0 ? 1.8 : 0;
      } else if (phase === 'countdown1') {
        mat.emissive.setHex(idx <= 1 ? 0xf59e0b : 0x000000);
        mat.emissiveIntensity = idx <= 1 ? 1.8 : 0;
      } else if (phase === 'countdown2') {
        mat.emissive.setHex(idx <= 1 ? 0xf59e0b : 0x000000);
        mat.emissiveIntensity = idx <= 1 ? 2.4 : 0;
      } else {
        mat.emissive.setHex(idx === 2 ? 0x10b981 : 0x000000);
        mat.emissiveIntensity = idx === 2 ? 2.6 : 0;
      }
    });
  }

  public syncFromSimulation(
    racers: LiveMarbleState[],
    gateOpenProgress: number,
    dt: number,
    prevRacers?: LiveMarbleState[],
    alpha: number = 1,
  ): void {
    // Animate starting gate drop/lift bar
    this.gateBarGroup.position.y = this.gateClosedY + gateOpenProgress * 1.45;

    const clampedAlpha = Math.max(0, Math.min(1, alpha));
    let leaderZ = 0;
    let packSumZ = 0;
    let activeCount = 0;

    for (let i = 0; i < racers.length; i++) {
      const r = racers[i];
      const rig = this.marbleRigs.get(r.marbleId);
      if (!rig) continue;

      const prev =
        prevRacers && prevRacers[i]?.marbleId === r.marbleId ? prevRacers[i] : undefined;

      const px = prev
        ? prev.position.x + (r.position.x - prev.position.x) * clampedAlpha
        : r.position.x;
      const py = prev
        ? prev.position.y + (r.position.y - prev.position.y) * clampedAlpha
        : r.position.y;
      const pz = prev
        ? prev.position.z + (r.position.z - prev.position.z) * clampedAlpha
        : r.position.z;

      rig.group.position.set(px, py, pz);
      _quatScratch.set(r.quaternion.x, r.quaternion.y, r.quaternion.z, r.quaternion.w);
      if (prev) {
        _prevQuatScratch.set(
          prev.quaternion.x,
          prev.quaternion.y,
          prev.quaternion.z,
          prev.quaternion.w,
        );
        _prevQuatScratch.slerp(_quatScratch, clampedAlpha);
        rig.innerCore.quaternion.copy(_prevQuatScratch);
      } else {
        rig.innerCore.quaternion.copy(_quatScratch);
      }

      const floorY = getSprintTrackSurfaceY(pz, this.config);
      rig.shadowDisc.position.set(px, floorY + 0.015, pz);

      if (!r.finished && pz > leaderZ) {
        leaderZ = pz;
      }
      if (pz <= this.config.trackLengthMeters + 4) {
        packSumZ += pz;
        activeCount++;
      }
    }

    const focusZ =
      leaderZ > 0
        ? leaderZ
        : activeCount > 0
          ? packSumZ / activeCount
          : this.config.trackLengthMeters;

    const focusY = getSprintTrackSurfaceY(focusZ, this.config);

    // Move keyLight shadow frustum along track with leader for razor-sharp marble shadows
    if (this.keyLight && !this.isSoftwareGl) {
      this.keyLight.position.set(16, focusY + 24, focusZ - 6);
      this.keyLight.target.position.set(0, focusY, focusZ + 4);
    }

    // Compute camera preset target
    switch (this.cameraMode) {
      case 'broadcast': {
        const clampedZ = Math.min(this.config.trackLengthMeters + 2, focusZ);
        const yTrack = getSprintTrackSurfaceY(clampedZ, this.config);
        _camTargetPos.set(6.4, yTrack + 4.4, clampedZ - 7.5);
        _camLookTarget.set(0, yTrack + 0.3, clampedZ + 5.5);
        break;
      }
      case 'overhead': {
        const midZ = activeCount > 0 ? packSumZ / activeCount : this.config.trackLengthMeters * 0.5;
        const yTrack = getSprintTrackSurfaceY(midZ, this.config);
        _camTargetPos.set(0, yTrack + 13.5, midZ - 4.0);
        _camLookTarget.set(0, yTrack, midZ + 4.0);
        break;
      }
      case 'finish': {
        const fz = this.config.trackLengthMeters;
        const fy = getSprintTrackSurfaceY(fz, this.config);
        _camTargetPos.set(4.8, fy + 2.8, fz + 8.5);
        _camLookTarget.set(0, fy + 0.6, fz - 12);
        break;
      }
      case 'gate': {
        const gy = getSprintTrackSurfaceY(0, this.config);
        _camTargetPos.set(-4.6, gy + 2.5, 4.8);
        _camLookTarget.set(0, gy + 0.5, -0.2);
        break;
      }
    }

    const dampAlpha = this.isSoftwareGl ? 0.35 : 1 - Math.exp(-5.5 * Math.max(0.001, dt));
    this.camera.position.lerp(_camTargetPos, dampAlpha);
    _curLookTarget.lerp(_camLookTarget, dampAlpha);
    this.camera.lookAt(_curLookTarget);
  }

  public renderFrame(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  public scheduleNextFrame(tickCallback: () => void): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(tickCallback);
    } else {
      this.frameId = window.requestAnimationFrame(tickCallback);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(320, this.container.clientWidth || window.innerWidth);
    const height = Math.max(240, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
