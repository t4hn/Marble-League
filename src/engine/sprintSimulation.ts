import * as CANNON from 'cannon-es';
import {Marble, SprintLayoutConfig, Team} from '../types/league';
import {createSeededRng} from './prng';
import {SPRINT_PHYSICS_CONFIG, SprintPhysicsConfig} from './sprintConfig';

export const MARBLE_RADIUS = SPRINT_PHYSICS_CONFIG.marbleRadius;
export const FIXED_PHYSICS_DT = SPRINT_PHYSICS_CONFIG.fixedDt;

export type SimulationEventType =
  | 'RACE_START'
  | 'LEAD_CHANGE'
  | 'OVERTAKE'
  | 'MARBLE_CONTACT'
  | 'CLOSE_CONTEST'
  | 'FALLING_BEHIND'
  | 'MARBLE_FINISH'
  | 'RACE_FINISH';

export interface SimulationEvent {
  id: string;
  type: SimulationEventType;
  elapsedSeconds: number;
  distanceMeters: number;
  primaryMarbleId?: string;
  secondaryMarbleId?: string;
  position?: number;
  gapSeconds?: number;
  speed?: number;
}

export interface LiveMarbleState {
  marbleId: string;
  teamId: string;
  name: string;
  shortCode: string;
  primaryColor: string;
  secondaryColor: string;
  lane: number; // 1..8
  position: {x: number; y: number; z: number};
  quaternion: {x: number; y: number; z: number; w: number};
  velocity: {x: number; y: number; z: number};
  speed: number;
  topSpeedReached: number;
  progressMeters: number;
  progressRatio: number;
  liveRank: number; // 1..8
  finished: boolean;
  finishTimeSeconds: number | null;
  gapToLeaderSeconds: number;
}

export interface SprintCompetitorInput {
  marble: Marble;
  team: Team;
  lane: number; // 1..8
}

export interface SprintTelemetry {
  marbleCollisions: number;
  significantCollisions: number;
  avgCollisionImpactSpeed: number;
  maxCollisionImpactSpeed: number;
  wallContacts: number;
  overtakes: number;
  leadChanges: number;
  collisionLinkedPositionChanges: number;
  closePackSeconds: number;
  stuckCount: number;
  escapedCount: number;
}

interface SeamImpulse {
  z: number;
  lateralImpulse: number;
  dragImpulse: number;
  triggered: boolean;
}

interface InternalRacer {
  input: SprintCompetitorInput;
  body: CANNON.Body;
  accelOffset: number;
  topSpeedOffset: number;
  handlingOffset: number;
  stabilityOffset: number;
  laneCenterX: number;
  gustPhase: number;
  gustFreq: number;
  topSpeedReached: number;
  finished: boolean;
  finishTimeSeconds: number | null;
  prevZ: number;
  lastContactTime: number;
  seams: SeamImpulse[];
}

export interface SprintSimulationSnapshot {
  seed: number;
  elapsedSeconds: number;
  started: boolean;
  finished: boolean;
  trackLengthMeters: number;
  gateOpenProgress: number; // 0 = closed, 1 = fully open
  racers: LiveMarbleState[];
}

/**
 * Computes exact track floor Y height at longitudinal coordinate z.
 * Shared identically between cannon-es physics collider geometry and Three.js visuals.
 */
export function getSprintTrackSurfaceY(z: number, config: SprintLayoutConfig): number {
  const rampRad = (config.rampSlopeDegrees * Math.PI) / 180;
  const mainRad = (config.mainSlopeDegrees * Math.PI) / 180;

  if (z <= config.rampLengthMeters) {
    return (config.rampLengthMeters - z) * Math.tan(rampRad);
  }
  return -(z - config.rampLengthMeters) * Math.tan(mainRad);
}

export function getSprintLaneCenterX(lane: number, laneWidth: number): number {
  return (lane - 4.5) * laneWidth;
}

/**
 * Pure headless 3D physics Sprint engine built on cannon-es.
 * Zero dependency on Three.js, DOM, or React.
 */
export class SprintSimulation {
  public readonly seed: number;
  public readonly config: SprintLayoutConfig;
  public readonly physicsConfig: SprintPhysicsConfig;

  private readonly world: CANNON.World;
  private readonly racers: InternalRacer[] = [];
  private readonly racerByBodyId = new Map<number, InternalRacer>();
  private readonly railBodyIds = new Set<number>();
  private readonly events: SimulationEvent[] = [];
  private readonly rng: () => number;

  private elapsedSeconds = 0;
  private started = false;
  private finished = false;
  private gateOpenProgress = 0;
  private gateDropBody: CANNON.Body;

  // Pre-allocated scratch buffers to avoid per-tick GC allocations
  private readonly _forceVec = new CANNON.Vec3();
  private readonly _impulseVec = new CANNON.Vec3();
  private readonly _orderedScratch: InternalRacer[] = [];
  private readonly _orderIdsScratch: string[] = [];

  // Race dynamics & commentary rate-limiting
  private currentLeaderId: string | null = null;
  private prevOrderIds: string[] = [];
  private lastOvertakeEventTime = -10;
  private lastContactEventTime = -10;
  private lastCloseContestTime = -10;
  private lastFallingBehindTime = -10;
  private eventSeq = 0;

  // Collision & overtaking instrumentation
  private marbleCollisions = 0;
  private significantCollisions = 0;
  private impactSpeedSum = 0;
  private maxImpactSpeed = 0;
  private wallContacts = 0;
  private overtakeCount = 0;
  private leadChangeCount = 0;
  private collisionLinkedPositionChanges = 0;
  private closePackTicks = 0;
  private readonly pairLastContactTime = new Map<string, number>();

  constructor(
    competitors: SprintCompetitorInput[],
    config: SprintLayoutConfig,
    seed: number,
    physicsConfig: SprintPhysicsConfig = SPRINT_PHYSICS_CONFIG,
  ) {
    this.seed = seed;
    this.config = config;
    this.physicsConfig = physicsConfig;
    this.rng = createSeededRng(seed);

    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, physicsConfig.gravityY, 0),
    });
    // Sort broadphase along Z (the race track axis) for minimal pair checks
    const sap = new CANNON.SAPBroadphase(this.world);
    sap.axisIndex = 2;
    this.world.broadphase = sap;
    (this.world.solver as CANNON.GSSolver).iterations = physicsConfig.solverIterations;

    const trackMat = new CANNON.Material('track');
    const railMat = new CANNON.Material('rail');
    const marbleMat = new CANNON.Material('marble');

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(marbleMat, trackMat, {
        friction: physicsConfig.materials.marbleTrack.friction,
        restitution: physicsConfig.materials.marbleTrack.restitution,
      }),
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(marbleMat, railMat, {
        friction: physicsConfig.materials.marbleRail.friction,
        restitution: physicsConfig.materials.marbleRail.restitution,
      }),
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(marbleMat, marbleMat, {
        friction: physicsConfig.materials.marbleMarble.friction,
        restitution: physicsConfig.materials.marbleMarble.restitution,
      }),
    );

    const totalWidth = config.laneWidthMeters * 8 + 0.6;
    const rampRad = (config.rampSlopeDegrees * Math.PI) / 180;
    const mainRad = (config.mainSlopeDegrees * Math.PI) / 180;
    const deckThickness = 0.6;

    // 1. Sloped launch ramp floor (-3m behind start gate to rampLengthMeters)
    const rampSpan = config.rampLengthMeters + 3.0;
    const rampHyp = rampSpan / Math.cos(rampRad);
    const rampCenterZ = (config.rampLengthMeters - 3.0) / 2;
    const rampCenterY =
      getSprintTrackSurfaceY(rampCenterZ, config) - (deckThickness / 2) * Math.cos(rampRad);
    const rampBody = new CANNON.Body({mass: 0, material: trackMat});
    rampBody.addShape(
      new CANNON.Box(new CANNON.Vec3(totalWidth / 2, deckThickness / 2, rampHyp / 2)),
    );
    rampBody.position.set(0, rampCenterY, rampCenterZ);
    rampBody.quaternion.setFromEuler(rampRad, 0, 0);
    this.world.addBody(rampBody);

    // 2. Flush bevel transition slab bridging ramp slope to main straightaway slope
    const transRad = (rampRad + mainRad) / 2;
    const transBody = new CANNON.Body({mass: 0, material: trackMat});
    transBody.addShape(new CANNON.Box(new CANNON.Vec3(totalWidth / 2, 0.3, 0.45)));
    transBody.position.set(
      0,
      getSprintTrackSurfaceY(config.rampLengthMeters, config) - 0.3 * Math.cos(transRad) - 0.012,
      config.rampLengthMeters,
    );
    transBody.quaternion.setFromEuler(transRad, 0, 0);
    this.world.addBody(transBody);

    // 3. Main straightaway floor from rampLengthMeters to trackLength + 16m runout
    const mainEndZ = config.trackLengthMeters + 16;
    const mainSpan = mainEndZ - config.rampLengthMeters;
    const mainHyp = mainSpan / Math.cos(mainRad);
    const mainCenterZ = config.rampLengthMeters + mainSpan / 2;
    const mainCenterY =
      getSprintTrackSurfaceY(mainCenterZ, config) - (deckThickness / 2) * Math.cos(mainRad);
    const mainBody = new CANNON.Body({mass: 0, material: trackMat});
    mainBody.addShape(
      new CANNON.Box(new CANNON.Vec3(totalWidth / 2, deckThickness / 2, mainHyp / 2)),
    );
    mainBody.position.set(0, mainCenterY, mainCenterZ);
    mainBody.quaternion.setFromEuler(mainRad, 0, 0);
    this.world.addBody(mainBody);

    // 4a. Full-length outer containment guard walls (i = 0 and i = 8)
    const outerHalfThick = 0.08;
    const outerHeight = physicsConfig.track.outerWallHeight;
    for (const i of [0, 8]) {
      const wallX = (i - 4) * config.laneWidthMeters + (i === 0 ? -0.04 : 0.04);

      const outerRampWall = new CANNON.Body({mass: 0, material: railMat});
      outerRampWall.addShape(
        new CANNON.Box(new CANNON.Vec3(outerHalfThick, outerHeight / 2, rampHyp / 2 + 0.25)),
      );
      outerRampWall.position.set(
        wallX,
        getSprintTrackSurfaceY(rampCenterZ, config) + outerHeight / 2 - 0.05,
        rampCenterZ,
      );
      outerRampWall.quaternion.setFromEuler(rampRad, 0, 0);
      this.world.addBody(outerRampWall);
      this.railBodyIds.add(outerRampWall.id);

      const outerMainWall = new CANNON.Body({mass: 0, material: railMat});
      outerMainWall.addShape(
        new CANNON.Box(new CANNON.Vec3(outerHalfThick, outerHeight / 2, mainHyp / 2 + 0.25)),
      );
      outerMainWall.position.set(
        wallX,
        getSprintTrackSurfaceY(mainCenterZ, config) + outerHeight / 2 - 0.05,
        mainCenterZ,
      );
      outerMainWall.quaternion.setFromEuler(mainRad, 0, 0);
      this.world.addBody(outerMainWall);
      this.railBodyIds.add(outerMainWall.id);
    }

    // 4b. Inner polycarbonate launch-chute dividers (i = 1..7) ending cleanly with rounded stanchions
    const innerHalfThick = 0.025;
    const innerHeight = physicsConfig.track.innerDividerHeight;
    const chuteExt = physicsConfig.track.launchChuteExtensionMeters;
    const chuteMainCenterZ = config.rampLengthMeters + chuteExt / 2;
    const chuteMainHyp = chuteExt / Math.cos(mainRad);
    const chuteEndZ = config.rampLengthMeters + chuteExt;
    const stanchionRadius = 0.045;

    for (let i = 1; i <= 7; i++) {
      const dividerX = (i - 4) * config.laneWidthMeters;

      const chuteRampRail = new CANNON.Body({mass: 0, material: railMat});
      chuteRampRail.addShape(
        new CANNON.Box(new CANNON.Vec3(innerHalfThick, innerHeight / 2, rampHyp / 2 + 0.05)),
      );
      chuteRampRail.position.set(
        dividerX,
        getSprintTrackSurfaceY(rampCenterZ, config) + innerHeight / 2 - 0.04,
        rampCenterZ,
      );
      chuteRampRail.quaternion.setFromEuler(rampRad, 0, 0);
      this.world.addBody(chuteRampRail);
      this.railBodyIds.add(chuteRampRail.id);

      if (chuteExt > 0.05) {
        const chuteExtRail = new CANNON.Body({mass: 0, material: railMat});
        chuteExtRail.addShape(
          new CANNON.Box(new CANNON.Vec3(innerHalfThick, innerHeight / 2, chuteMainHyp / 2)),
        );
        chuteExtRail.position.set(
          dividerX,
          getSprintTrackSurfaceY(chuteMainCenterZ, config) + innerHeight / 2 - 0.04,
          chuteMainCenterZ,
        );
        chuteExtRail.quaternion.setFromEuler(mainRad, 0, 0);
        this.world.addBody(chuteExtRail);
        this.railBodyIds.add(chuteExtRail.id);
      }

      const postBody = new CANNON.Body({mass: 0, material: railMat});
      postBody.addShape(new CANNON.Cylinder(stanchionRadius, stanchionRadius, innerHeight + 0.04, 8));
      postBody.position.set(
        dividerX,
        getSprintTrackSurfaceY(chuteEndZ, config) + innerHeight / 2 - 0.02,
        chuteEndZ,
      );
      this.world.addBody(postBody);
      this.railBodyIds.add(postBody.id);
    }

    // 5. Mechanical starting gate barrier at z = 0.32 (lifted cleanly when race starts)
    this.gateDropBody = new CANNON.Body({mass: 0, material: railMat});
    this.gateDropBody.addShape(new CANNON.Box(new CANNON.Vec3(totalWidth / 2, 0.35, 0.06)));
    this.gateDropBody.position.set(0, getSprintTrackSurfaceY(0.32, config) + 0.35, 0.32);
    this.world.addBody(this.gateDropBody);

    // 6. Catch-basin end buffer wall past finish runout
    const stopWall = new CANNON.Body({mass: 0, material: railMat});
    stopWall.addShape(new CANNON.Box(new CANNON.Vec3(totalWidth / 2, 0.8, 0.3)));
    stopWall.position.set(
      0,
      getSprintTrackSurfaceY(config.trackLengthMeters + 14, config) + 0.5,
      config.trackLengthMeters + 14,
    );
    this.world.addBody(stopWall);

    // 7. Create the 8 marble rigid bodies
    for (const comp of competitors) {
      const laneCenterX = getSprintLaneCenterX(comp.lane, config.laneWidthMeters);
      const startZ = -0.3;
      const startY =
        getSprintTrackSurfaceY(startZ, config) + physicsConfig.marbleRadius + 0.004;

      const body = new CANNON.Body({
        mass: physicsConfig.marbleMass,
        material: marbleMat,
        linearDamping: physicsConfig.damping.linear,
        angularDamping: physicsConfig.damping.angular,
      });
      body.addShape(new CANNON.Sphere(physicsConfig.marbleRadius));
      body.position.set(laneCenterX, startY, startZ);

      const {acceleration, topSpeed, handling, stability} = comp.marble.attributes;

      // Generate deterministic track seam perturbations along this lane corridor
      const seams: SeamImpulse[] = [];
      const spacing = (config.trackLengthMeters - 10) / Math.max(1, config.seamCount);
      for (let s = 0; s < config.seamCount; s++) {
        const zPos = 8 + s * spacing + (this.rng() - 0.5) * 2.4;
        const lateralDir = this.rng() < 0.5 ? -1 : 1;
        const mag = (0.35 + this.rng() * 0.75) * config.surfaceRoughness;
        seams.push({
          z: zPos,
          lateralImpulse: lateralDir * mag * physicsConfig.variance.seamLateralScale,
          dragImpulse: mag * physicsConfig.variance.seamDragScale,
          triggered: false,
        });
      }

      const racer: InternalRacer = {
        input: comp,
        body,
        accelOffset: acceleration - 70,
        topSpeedOffset: topSpeed - 70,
        handlingOffset: handling - 70,
        stabilityOffset: stability - 70,
        laneCenterX,
        gustPhase: this.rng() * Math.PI * 2,
        gustFreq: 0.75 + this.rng() * 0.85,
        topSpeedReached: 0,
        finished: false,
        finishTimeSeconds: null,
        prevZ: startZ,
        lastContactTime: -10,
        seams,
      };

      this.world.addBody(body);
      this.racerByBodyId.set(body.id, racer);
      this.racers.push(racer);
      this._orderedScratch.push(racer);
      this._orderIdsScratch.push(comp.marble.id);
    }

    this.attachContactListener();
  }

  private attachContactListener(): void {
    this.world.addEventListener(
      'beginContact',
      (event: {bodyA: CANNON.Body; bodyB: CANNON.Body}) => {
        if (!this.started || this.finished) return;
        const rA = this.racerByBodyId.get(event.bodyA.id);
        const rB = this.racerByBodyId.get(event.bodyB.id);

        if (rA && rB) {
          if (rA.finished || rB.finished) return;
          const pairKey =
            rA.body.id < rB.body.id
              ? `${rA.body.id}|${rB.body.id}`
              : `${rB.body.id}|${rA.body.id}`;
          const lastPairTime = this.pairLastContactTime.get(pairKey) ?? -10;
          if (this.elapsedSeconds - lastPairTime < 0.14) return;
          this.pairLastContactTime.set(pairKey, this.elapsedSeconds);

          const dvx = rA.body.velocity.x - rB.body.velocity.x;
          const dvy = rA.body.velocity.y - rB.body.velocity.y;
          const dvz = rA.body.velocity.z - rB.body.velocity.z;
          const impactSpeed = Math.hypot(dvx, dvy, dvz);

          this.marbleCollisions += 1;
          this.impactSpeedSum += impactSpeed;
          if (impactSpeed > this.maxImpactSpeed) {
            this.maxImpactSpeed = impactSpeed;
          }

          rA.lastContactTime = this.elapsedSeconds;
          rB.lastContactTime = this.elapsedSeconds;

          if (impactSpeed >= this.physicsConfig.telemetry.significantImpactSpeed) {
            this.significantCollisions += 1;
            if (this.elapsedSeconds - this.lastContactEventTime > 2.2) {
              this.lastContactEventTime = this.elapsedSeconds;
              const leadRacer = rA.body.position.z >= rB.body.position.z ? rA : rB;
              const trailRacer = leadRacer === rA ? rB : rA;
              this.pushEvent({
                type: 'MARBLE_CONTACT',
                elapsedSeconds: this.elapsedSeconds,
                distanceMeters: (rA.body.position.z + rB.body.position.z) * 0.5,
                primaryMarbleId: leadRacer.input.marble.id,
                secondaryMarbleId: trailRacer.input.marble.id,
                speed: impactSpeed,
              });
            }
          }
          return;
        }

        // Track rail contact counts for diagnostics
        if (rA && this.railBodyIds.has(event.bodyB.id) && !rA.finished) {
          this.wallContacts += 1;
        } else if (rB && this.railBodyIds.has(event.bodyA.id) && !rB.finished) {
          this.wallContacts += 1;
        }
      },
    );
  }

  public startRace(): void {
    if (this.started) return;
    this.started = true;
    this.gateDropBody.position.y += 4.0;
    this.gateDropBody.collisionResponse = false;

    const p = this.physicsConfig.propulsion;
    const a = this.physicsConfig.attributes;
    const R = this.physicsConfig.marbleRadius;

    // Seeded starting-gate release impulse (scaled by Acceleration + realistic gate variance)
    for (const r of this.racers) {
      const accelMod = 1 + r.accelOffset * a.accelSensitivity;
      const jitter = 1 + (this.rng() * 2 - 1) * p.gateJitterFraction;
      const launchSpeed = p.baseGateSpeed * accelMod * jitter;
      r.body.applyImpulse(new CANNON.Vec3(0, 0, launchSpeed * this.physicsConfig.marbleMass));
      // Matching initial spin impulse for clean immediate launch roll
      r.body.angularVelocity.x = launchSpeed / R;
    }

    this.pushEvent({
      type: 'RACE_START',
      elapsedSeconds: 0,
      distanceMeters: 0,
    });
  }

  public step(fixedDt: number = FIXED_PHYSICS_DT): SimulationEvent[] {
    const newEvents: SimulationEvent[] = [];
    if (!this.started || this.finished) return newEvents;

    const prevEventCount = this.events.length;
    this.elapsedSeconds += fixedDt;
    this.gateOpenProgress = Math.min(1, this.gateOpenProgress + fixedDt * 5.0);

    const pc = this.physicsConfig;
    const chuteEndZ = this.config.rampLengthMeters + pc.track.launchChuteExtensionMeters;
    const outerHalfWidth = this.config.laneWidthMeters * 4;

    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      const vx = r.body.velocity.x;
      const vz = r.body.velocity.z;
      const x = r.body.position.x;
      const z = r.body.position.z;

      if (!r.finished) {
        const accelFactor = 1 + r.accelOffset * pc.attributes.accelSensitivity;
        const aeroFactor = Math.max(0.7, 1 - r.topSpeedOffset * pc.attributes.topSpeedAeroSensitivity);
        const handlingFactor = 1 + r.handlingOffset * pc.attributes.handlingSensitivity;
        const stabilityFactor = Math.max(0.68, 1 - r.stabilityOffset * pc.attributes.stabilitySensitivity);

        // 1. Continuous forward rolling drive (gravity assists strongly on ramp; drive sustains straightaway)
        const inRampZone = z < this.config.rampLengthMeters + 2.5;
        const baseDrive = inRampZone ? pc.propulsion.rampDriveForce : pc.propulsion.mainDriveForce;
        // Acceleration helps strongly on launch & ramp, tapering down once at full straightaway speed
        const accelWeight = inRampZone ? 1.0 : 0.25;
        const effectiveDrive = baseDrive * (1 + (accelFactor - 1) * accelWeight);

        // 2. Slipstream drafting behind a leading marble on the open straightaway
        let dragReduction = 0;
        let draftPullX = 0;
        if (z > chuteEndZ) {
          for (let j = 0; j < this.racers.length; j++) {
            if (i === j) continue;
            const ahead = this.racers[j];
            if (ahead.finished) continue;
            const dz = ahead.body.position.z - z;
            if (dz >= pc.drafting.minGapMeters && dz <= pc.drafting.maxGapMeters) {
              const dx = ahead.body.position.x - x;
              const absDx = Math.abs(dx);
              if (absDx <= pc.drafting.maxLateralOffsetMeters) {
                const distFactor =
                  1 - (dz - pc.drafting.minGapMeters) / (pc.drafting.maxGapMeters - pc.drafting.minGapMeters);
                const alignFactor = 1 - absDx / pc.drafting.maxLateralOffsetMeters;
                const candidateReduction = pc.drafting.maxDragReduction * distFactor * alignFactor;
                if (candidateReduction > dragReduction) {
                  dragReduction = candidateReduction;
                }
                // Agile (high-HND) marbles subtly tuck into or peek out of the wake
                if (absDx > 0.12) {
                  draftPullX +=
                    Math.sign(dx) * pc.drafting.slipstreamPullForce * handlingFactor * distFactor;
                }
              }
            }
          }
        }

        // 3. Quadratic aerodynamic drag + linear rolling resistance (reduced by Handling)
        const speedZ = Math.max(0, vz);
        const aeroDrag =
          pc.propulsion.aeroDragCoeff * aeroFactor * (1 - dragReduction) * speedZ * speedZ;
        const rollingDrag =
          (pc.propulsion.rollingResistance / Math.max(0.7, handlingFactor)) * speedZ;

        // Lateral velocity scrubbing & high-speed surface chatter (mitigated by Handling & Stability)
        const lateralScrub = (Math.abs(vx) * 0.34) / Math.max(0.7, handlingFactor);
        const surfaceChatter =
          (0.08 * this.config.surfaceRoughness * stabilityFactor * speedZ) / 10;

        // Deterministic micro-turbulence gusts (mitigated by Stability)
        const gustForceZ =
          Math.sin(z * 0.24 + this.elapsedSeconds * r.gustFreq + r.gustPhase) *
          pc.variance.gustForceAmplitude *
          stabilityFactor;

        const netForceZ =
          effectiveDrive + gustForceZ - aeroDrag - rollingDrag - lateralScrub - surfaceChatter;

        // 4. Soft lane guidance (stronger inside launch chute, very gentle on open straightaway)
        const inChute = z <= chuteEndZ;
        const lateralOffset = x - r.laneCenterX;
        let forceX = draftPullX;
        if (inChute) {
          forceX +=
            -lateralOffset * pc.laneGuidance.chuteSpringK * handlingFactor -
            vx * pc.laneGuidance.chuteDamping;
        } else {
          // Subtle lane affinity + outer guard-wall air cushion so marbles stay active in the pack
          forceX +=
            -lateralOffset * pc.laneGuidance.openSpringK * handlingFactor -
            vx * pc.laneGuidance.openDamping;
          const distToWall = outerHalfWidth - Math.abs(x);
          if (distToWall < pc.laneGuidance.wallBufferMeters) {
            const wallDepth = pc.laneGuidance.wallBufferMeters - distToWall;
            forceX += -Math.sign(x) * wallDepth * pc.laneGuidance.wallRepelForce * handlingFactor;
          }
        }

        // Damp anomalous upward pinch bounces so pinched marbles stay grounded on the deck
        const forceY = r.body.velocity.y > 0.65 ? -r.body.velocity.y * 5.0 : 0;
        this._forceVec.set(forceX, forceY, netForceZ);
        r.body.applyForce(this._forceVec);

        // 5. Track seam perturbations via physical impulses (no direct velocity overwriting)
        for (const seam of r.seams) {
          if (!seam.triggered && z >= seam.z) {
            seam.triggered = true;
            const latImpulse =
              (seam.lateralImpulse * stabilityFactor) / (0.85 + 0.15 * handlingFactor);
            const dragImpulse =
              -seam.dragImpulse * stabilityFactor * (1.08 - 0.08 * accelFactor);
            // Cap drag impulse so a marble can never stall below minimum forward flow
            const safeDrag = Math.max(dragImpulse, -(Math.max(0, vz - 3.5)) * 0.5);
            this._impulseVec.set(latImpulse, 0, safeDrag);
            r.body.applyImpulse(this._impulseVec);
          }
        }
      } else {
        // Post-finish smooth coasting deceleration in catch basin
        this._forceVec.set(-vx * 2.5, 0, -vz * 1.8);
        r.body.applyForce(this._forceVec);
      }
    }

    this.world.step(fixedDt);

    // Post-step checks: top speed, finish line crossings, close-pack metric, race dynamics
    let allFinished = true;
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      const z = r.body.position.z;
      const speed = Math.hypot(r.body.velocity.x, r.body.velocity.y, r.body.velocity.z);
      if (speed > r.topSpeedReached && !r.finished) {
        r.topSpeedReached = speed;
      }

      if (!r.finished && z >= this.config.trackLengthMeters) {
        const dz = Math.max(1e-6, z - r.prevZ);
        const frac = Math.max(0, Math.min(1, (this.config.trackLengthMeters - r.prevZ) / dz));
        const exactTime = this.elapsedSeconds - fixedDt * (1 - frac);
        r.finished = true;
        r.finishTimeSeconds = exactTime;

        const finishedCount = this.racers.filter((x) => x.finished).length;
        this.pushEvent({
          type: 'MARBLE_FINISH',
          elapsedSeconds: exactTime,
          distanceMeters: this.config.trackLengthMeters,
          primaryMarbleId: r.input.marble.id,
          position: finishedCount,
          speed: r.topSpeedReached,
        });
      }

      if (!r.finished) {
        allFinished = false;
        // Close-pack separation check against active competitors
        for (let j = i + 1; j < this.racers.length; j++) {
          const other = this.racers[j];
          if (!other.finished && Math.abs(z - other.body.position.z) <= pc.telemetry.closePackMeters) {
            this.closePackTicks += 1;
          }
        }
      }
      r.prevZ = z;
    }

    this.evaluateRaceDynamics();

    if (allFinished && !this.finished) {
      this.finished = true;
      this.pushEvent({
        type: 'RACE_FINISH',
        elapsedSeconds: this.elapsedSeconds,
        distanceMeters: this.config.trackLengthMeters,
      });
    }

    for (let i = prevEventCount; i < this.events.length; i++) {
      newEvents.push(this.events[i]);
    }
    return newEvents;
  }

  private evaluateRaceDynamics(): void {
    const ordered = this.getOrderedRacers();
    if (ordered.length === 0) return;

    const leader = ordered[0];
    const second = ordered[1];
    const last = ordered[ordered.length - 1];
    const orderIds = ordered.map((r) => r.input.marble.id);

    // Lead change detection (only after 4m so launch settle isn't noisy)
    if (leader.body.position.z > 4 && !leader.finished) {
      if (this.currentLeaderId && this.currentLeaderId !== leader.input.marble.id) {
        this.leadChangeCount += 1;
        this.pushEvent({
          type: 'LEAD_CHANGE',
          elapsedSeconds: this.elapsedSeconds,
          distanceMeters: leader.body.position.z,
          primaryMarbleId: leader.input.marble.id,
          secondaryMarbleId: this.currentLeaderId,
        });
        this.lastOvertakeEventTime = this.elapsedSeconds;
      }
      this.currentLeaderId = leader.input.marble.id;
    }

    // Track every authentic active-field overtake + collision-linked rank shift
    if (this.prevOrderIds.length === orderIds.length && leader.body.position.z > 4) {
      let emittedCommentaryOvertake = false;
      for (let i = 0; i < ordered.length; i++) {
        const racer = ordered[i];
        if (racer.finished) continue;
        const prevIdx = this.prevOrderIds.indexOf(racer.input.marble.id);
        if (prevIdx > i) {
          this.overtakeCount += prevIdx - i;
          if (
            this.elapsedSeconds - racer.lastContactTime <=
            this.physicsConfig.telemetry.collisionRankWindowSeconds
          ) {
            this.collisionLinkedPositionChanges += 1;
          }

          if (
            !emittedCommentaryOvertake &&
            i > 0 &&
            this.elapsedSeconds - this.lastOvertakeEventTime > 1.35 &&
            leader.body.position.z > 8 &&
            leader.body.position.z < this.config.trackLengthMeters - 3
          ) {
            const passedId = this.prevOrderIds[i];
            if (passedId && passedId !== racer.input.marble.id) {
              this.pushEvent({
                type: 'OVERTAKE',
                elapsedSeconds: this.elapsedSeconds,
                distanceMeters: racer.body.position.z,
                primaryMarbleId: racer.input.marble.id,
                secondaryMarbleId: passedId,
                position: i + 1,
              });
              this.lastOvertakeEventTime = this.elapsedSeconds;
              emittedCommentaryOvertake = true;
            }
          }
        }
      }
    }

    // Close contest between P1 and P2 past halfway
    if (
      second &&
      !leader.finished &&
      leader.body.position.z > this.config.trackLengthMeters * 0.48 &&
      this.elapsedSeconds - this.lastCloseContestTime > 3.2
    ) {
      const distGap = leader.body.position.z - second.body.position.z;
      if (distGap < 0.85) {
        this.pushEvent({
          type: 'CLOSE_CONTEST',
          elapsedSeconds: this.elapsedSeconds,
          distanceMeters: leader.body.position.z,
          primaryMarbleId: leader.input.marble.id,
          secondaryMarbleId: second.input.marble.id,
          gapSeconds: distGap / Math.max(1, leader.body.velocity.z),
        });
        this.lastCloseContestTime = this.elapsedSeconds;
      }
    }

    // Competitor falling noticeably behind late in the run
    if (
      last &&
      !last.finished &&
      leader.body.position.z > this.config.trackLengthMeters * 0.6 &&
      this.elapsedSeconds - this.lastFallingBehindTime > 4.0
    ) {
      const gapMeters = leader.body.position.z - last.body.position.z;
      if (gapMeters > 5.5) {
        this.pushEvent({
          type: 'FALLING_BEHIND',
          elapsedSeconds: this.elapsedSeconds,
          distanceMeters: last.body.position.z,
          primaryMarbleId: last.input.marble.id,
        });
        this.lastFallingBehindTime = this.elapsedSeconds;
      }
    }

    this.prevOrderIds = orderIds;
  }

  private pushEvent(partial: Omit<SimulationEvent, 'id'>): void {
    this.eventSeq += 1;
    this.events.push({
      id: `evt_${this.eventSeq}`,
      ...partial,
    });
  }

  private getOrderedRacers(): InternalRacer[] {
    this._orderedScratch.sort((a, b) => {
      if (a.finished && b.finished) {
        return (a.finishTimeSeconds ?? 0) - (b.finishTimeSeconds ?? 0);
      }
      if (a.finished) return -1;
      if (b.finished) return 1;
      const zDiff = b.body.position.z - a.body.position.z;
      if (Math.abs(zDiff) > 1e-5) return zDiff;
      return a.input.lane - b.input.lane;
    });
    return this._orderedScratch;
  }

  public getEvents(): SimulationEvent[] {
    return [...this.events];
  }

  public isFinished(): boolean {
    return this.finished;
  }

  public isStarted(): boolean {
    return this.started;
  }

  public getElapsedSeconds(): number {
    return this.elapsedSeconds;
  }

  public getTelemetry(): SprintTelemetry {
    const outerLimit = this.config.laneWidthMeters * 4 + 0.5;
    let stuckCount = 0;
    let escapedCount = 0;

    for (const r of this.racers) {
      if (!r.finished) {
        stuckCount += 1;
      }
      if (
        Math.abs(r.body.position.x) > outerLimit ||
        r.body.position.y < -25 ||
        r.body.position.y > 20
      ) {
        escapedCount += 1;
      }
    }

    return {
      marbleCollisions: this.marbleCollisions,
      significantCollisions: this.significantCollisions,
      avgCollisionImpactSpeed:
        this.marbleCollisions > 0 ? this.impactSpeedSum / this.marbleCollisions : 0,
      maxCollisionImpactSpeed: this.maxImpactSpeed,
      wallContacts: this.wallContacts,
      overtakes: this.overtakeCount,
      leadChanges: this.leadChangeCount,
      collisionLinkedPositionChanges: this.collisionLinkedPositionChanges,
      closePackSeconds: (this.closePackTicks * this.physicsConfig.fixedDt) / 8,
      stuckCount,
      escapedCount,
    };
  }

  public getAngularRollingCheck(): Array<{
    marbleId: string;
    linearZ: number;
    spinXR: number;
  }> {
    return this.racers.map((r) => ({
      marbleId: r.input.marble.id,
      linearZ: r.body.velocity.z,
      spinXR: r.body.angularVelocity.x * this.physicsConfig.marbleRadius,
    }));
  }

  public getSnapshot(): SprintSimulationSnapshot {
    const ordered = this.getOrderedRacers();
    const rankById = new Map<string, number>();
    ordered.forEach((r, idx) => rankById.set(r.input.marble.id, idx + 1));

    const leader = ordered[0];
    const leaderZ = leader?.body.position.z ?? 0;
    const leaderTime = leader?.finishTimeSeconds ?? this.elapsedSeconds;

    const racers: LiveMarbleState[] = this.racers.map((r) => {
      const rank = rankById.get(r.input.marble.id) ?? 8;
      const z = r.body.position.z;
      const speed = Math.hypot(r.body.velocity.x, r.body.velocity.y, r.body.velocity.z);
      let gapSec = 0;
      if (r.finished && r.finishTimeSeconds !== null) {
        gapSec = Math.max(0, r.finishTimeSeconds - leaderTime);
      } else if (leader && !leader.finished) {
        const distGap = Math.max(0, leaderZ - z);
        gapSec = distGap / Math.max(4, leader.body.velocity.z);
      }

      return {
        marbleId: r.input.marble.id,
        teamId: r.input.team.id,
        name: r.input.marble.name,
        shortCode: r.input.team.shortCode,
        primaryColor: r.input.team.primaryColor,
        secondaryColor: r.input.team.secondaryColor,
        lane: r.input.lane,
        position: {x: r.body.position.x, y: r.body.position.y, z},
        quaternion: {
          x: r.body.quaternion.x,
          y: r.body.quaternion.y,
          z: r.body.quaternion.z,
          w: r.body.quaternion.w,
        },
        velocity: {
          x: r.body.velocity.x,
          y: r.body.velocity.y,
          z: r.body.velocity.z,
        },
        speed,
        topSpeedReached: r.topSpeedReached,
        progressMeters: Math.max(0, Math.min(this.config.trackLengthMeters, z)),
        progressRatio: Math.max(0, Math.min(1, z / this.config.trackLengthMeters)),
        liveRank: rank,
        finished: r.finished,
        finishTimeSeconds: r.finishTimeSeconds,
        gapToLeaderSeconds: Number(gapSec.toFixed(3)),
      };
    });

    return {
      seed: this.seed,
      elapsedSeconds: this.elapsedSeconds,
      started: this.started,
      finished: this.finished,
      trackLengthMeters: this.config.trackLengthMeters,
      gateOpenProgress: this.gateOpenProgress,
      racers,
    };
  }
}
