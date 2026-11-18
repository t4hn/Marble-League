import * as CANNON from 'cannon-es';
import {Marble, SprintLayoutConfig, Team} from '../types/league';
import {createSeededRng} from './prng';

export const MARBLE_RADIUS = 0.24;
export const FIXED_PHYSICS_DT = 1 / 120;

export type SimulationEventType =
  | 'RACE_START'
  | 'LEAD_CHANGE'
  | 'OVERTAKE'
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

interface SeamImpulse {
  z: number;
  lateralImpulse: number;
  dragImpulse: number;
  triggered: boolean;
}

interface InternalRacer {
  input: SprintCompetitorInput;
  body: CANNON.Body;
  vMax: number;
  accelMultiplier: number;
  handlingFactor: number;
  stabilityFactor: number;
  laneCenterX: number;
  topSpeedReached: number;
  finished: boolean;
  finishTimeSeconds: number | null;
  prevZ: number;
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
  private readonly world: CANNON.World;
  private readonly racers: InternalRacer[] = [];
  private readonly events: SimulationEvent[] = [];
  private readonly rng: () => number;

  private elapsedSeconds = 0;
  private started = false;
  private finished = false;
  private gateOpenProgress = 0;
  private gateDropBody: CANNON.Body;

  // Event tracking state
  private currentLeaderId: string | null = null;
  private prevOrderIds: string[] = [];
  private lastOvertakeEventTime = -10;
  private lastCloseContestTime = -10;
  private lastFallingBehindTime = -10;
  private eventSeq = 0;

  constructor(competitors: SprintCompetitorInput[], config: SprintLayoutConfig, seed: number) {
    this.seed = seed;
    this.config = config;
    this.rng = createSeededRng(seed);

    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.81, 0),
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    (this.world.solver as CANNON.GSSolver).iterations = 8;

    const trackMat = new CANNON.Material('track');
    const railMat = new CANNON.Material('rail');
    const marbleMat = new CANNON.Material('marble');

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(marbleMat, trackMat, {
        friction: 0.035,
        restitution: 0.12,
      }),
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(marbleMat, railMat, {
        friction: 0.06,
        restitution: 0.35,
      }),
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(marbleMat, marbleMat, {
        friction: 0.05,
        restitution: 0.72,
      }),
    );

    const totalWidth = config.laneWidthMeters * 8 + 0.6;
    const rampRad = (config.rampSlopeDegrees * Math.PI) / 180;
    const mainRad = (config.mainSlopeDegrees * Math.PI) / 180;

    // 1. Sloped launch ramp floor (-3m behind start gate to rampLengthMeters)
    const rampSpan = config.rampLengthMeters + 3.0;
    const rampHyp = rampSpan / Math.cos(rampRad);
    const rampThickness = 0.6;
    const rampCenterZ = (config.rampLengthMeters - 3.0) / 2;
    const rampCenterY =
      getSprintTrackSurfaceY(rampCenterZ, config) -
      (rampThickness / 2) * Math.cos(rampRad);
    const rampBody = new CANNON.Body({mass: 0, material: trackMat});
    rampBody.addShape(
      new CANNON.Box(new CANNON.Vec3(totalWidth / 2, rampThickness / 2, rampHyp / 2 + 0.15)),
    );
    rampBody.position.set(0, rampCenterY, rampCenterZ);
    rampBody.quaternion.setFromEuler(rampRad, 0, 0);
    this.world.addBody(rampBody);

    // 2. Smooth bevel transition wedge at z = rampLengthMeters so marbles never hop
    const transRad = (rampRad + mainRad) / 2;
    const transBody = new CANNON.Body({mass: 0, material: trackMat});
    transBody.addShape(new CANNON.Box(new CANNON.Vec3(totalWidth / 2, 0.3, 0.55)));
    transBody.position.set(
      0,
      getSprintTrackSurfaceY(config.rampLengthMeters, config) - 0.3 * Math.cos(transRad) - 0.015,
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
      getSprintTrackSurfaceY(mainCenterZ, config) -
      (rampThickness / 2) * Math.cos(mainRad);
    const mainBody = new CANNON.Body({mass: 0, material: trackMat});
    mainBody.addShape(
      new CANNON.Box(new CANNON.Vec3(totalWidth / 2, rampThickness / 2, mainHyp / 2 + 0.15)),
    );
    mainBody.position.set(0, mainCenterY, mainCenterZ);
    mainBody.quaternion.setFromEuler(mainRad, 0, 0);
    this.world.addBody(mainBody);

    // 4. Lane divider rails (9 dividers forming 8 straight-line lanes)
    const wallHeight = 0.34;
    const wallHalfThick = 0.04;
    for (let i = 0; i <= 8; i++) {
      const dividerX = (i - 4) * config.laneWidthMeters;
      // Ramp section rail
      const rampRail = new CANNON.Body({mass: 0, material: railMat});
      rampRail.addShape(
        new CANNON.Box(new CANNON.Vec3(wallHalfThick, wallHeight / 2, rampHyp / 2 + 0.1)),
      );
      rampRail.position.set(
        dividerX,
        getSprintTrackSurfaceY(rampCenterZ, config) + wallHeight / 2 - 0.04,
        rampCenterZ,
      );
      rampRail.quaternion.setFromEuler(rampRad, 0, 0);
      this.world.addBody(rampRail);

      // Main section rail
      const mainRail = new CANNON.Body({mass: 0, material: railMat});
      mainRail.addShape(
        new CANNON.Box(new CANNON.Vec3(wallHalfThick, wallHeight / 2, mainHyp / 2 + 0.1)),
      );
      mainRail.position.set(
        dividerX,
        getSprintTrackSurfaceY(mainCenterZ, config) + wallHeight / 2 - 0.04,
        mainCenterZ,
      );
      mainRail.quaternion.setFromEuler(mainRad, 0, 0);
      this.world.addBody(mainRail);
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
      const startY = getSprintTrackSurfaceY(startZ, config) + MARBLE_RADIUS + 0.005;

      const body = new CANNON.Body({
        mass: 1.0,
        material: marbleMat,
        linearDamping: 0.02,
        angularDamping: 0.04,
      });
      body.addShape(new CANNON.Sphere(MARBLE_RADIUS));
      body.position.set(laneCenterX, startY, startZ);

      const {acceleration, topSpeed, handling, stability} = comp.marble.attributes;

      // Calibrated attribute-to-physics mappings
      // Top Speed 52..92 -> 10.6 .. 12.8 m/s
      const vMax = 11.6 + (topSpeed - 70) * 0.055;
      // Acceleration 52..92 -> 0.82 .. 1.24 drive response
      const accelMultiplier = 1.0 + (acceleration - 70) * 0.0095;
      // Handling 52..92 -> lane centering precision
      const handlingFactor = 0.65 + (handling - 70) * 0.012;
      // Stability 52..92 -> resistance to track seam disruption
      const stabilityFactor = Math.max(0.25, (116 - stability) / 46);

      // Generate deterministic track seam perturbations along this lane
      const seams: SeamImpulse[] = [];
      const spacing = (config.trackLengthMeters - 10) / Math.max(1, config.seamCount);
      for (let s = 0; s < config.seamCount; s++) {
        const zPos = 8 + s * spacing + (this.rng() - 0.5) * 2.2;
        const lateralDir = this.rng() < 0.5 ? -1 : 1;
        const mag = (0.35 + this.rng() * 0.65) * config.surfaceRoughness;
        seams.push({
          z: zPos,
          lateralImpulse: lateralDir * mag * 0.9,
          dragImpulse: mag * 0.55,
          triggered: false,
        });
      }

      this.world.addBody(body);
      this.racers.push({
        input: comp,
        body,
        vMax,
        accelMultiplier,
        handlingFactor,
        stabilityFactor,
        laneCenterX,
        topSpeedReached: 0,
        finished: false,
        finishTimeSeconds: null,
        prevZ: startZ,
        seams,
      });
    }
  }

  public startRace(): void {
    if (this.started) return;
    this.started = true;
    this.gateDropBody.position.y += 4.0;
    this.gateDropBody.collisionResponse = false;

    // Simultaneous launch micro-impulse (tiny 1% seeded variation at gate drop)
    for (const r of this.racers) {
      const gateSnap = (0.985 + this.rng() * 0.03) * r.accelMultiplier;
      r.body.velocity.z = 1.35 * gateSnap;
      r.body.angularVelocity.x = r.body.velocity.z / MARBLE_RADIUS;
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

    for (const r of this.racers) {
      const vz = r.body.velocity.z;
      const vx = r.body.velocity.x;
      const z = r.body.position.z;

      if (!r.finished) {
        // 1. Rolling drive force scaled by Acceleration & remaining headroom to Top Speed
        const speedRatio = Math.max(0, vz / r.vMax);
        const driveHeadroom = Math.max(0, 1 - speedRatio * speedRatio);
        // Stronger drive on ramp/launch, tapering smoothly near vMax
        const onRamp = z < this.config.rampLengthMeters;
        const baseDrive = onRamp ? 6.8 : 4.6;
        const driveForceZ = baseDrive * r.accelMultiplier * (0.22 + 0.78 * driveHeadroom);
        r.body.applyForce(new CANNON.Vec3(0, 0, driveForceZ));

        // 2. Aerodynamic drag enforcing Top Speed ceiling naturally
        if (vz > r.vMax * 0.85) {
          const excess = Math.max(0, vz - r.vMax * 0.85);
          const dragZ = -(excess * 1.45 + Math.max(0, vz - r.vMax) * 6.5);
          r.body.applyForce(new CANNON.Vec3(0, 0, dragZ));
        }

        // 3. Handling: lateral lane-centering & rail-skim energy preservation
        const lateralOffset = r.body.position.x - r.laneCenterX;
        const centeringForceX =
          -lateralOffset * (6.5 * r.handlingFactor) - vx * (2.2 * r.handlingFactor);
        r.body.applyForce(new CANNON.Vec3(centeringForceX, 0, 0));

        // Slight energy bleed if marble drifts far enough to skim lane divider
        const halfLaneLimit = this.config.laneWidthMeters * 0.5 - MARBLE_RADIUS - 0.05;
        if (Math.abs(lateralOffset) > halfLaneLimit) {
          const skimPenalty = (1.35 - r.handlingFactor * 0.45) * 1.8;
          r.body.applyForce(new CANNON.Vec3(0, 0, -Math.max(0.2, skimPenalty)));
        }

        // 4. Stability: deterministic track joint seam micro-perturbations
        for (const seam of r.seams) {
          if (!seam.triggered && z >= seam.z) {
            seam.triggered = true;
            const disrupt = r.stabilityFactor;
            // Lateral wobble inversely scaled by Stability & Handling
            const latImpulse = (seam.lateralImpulse * disrupt) / (0.8 + r.handlingFactor * 0.3);
            const slowImpulse = -seam.dragImpulse * disrupt * (1.15 - r.accelMultiplier * 0.15);
            r.body.velocity.x += latImpulse;
            r.body.velocity.z = Math.max(2.0, r.body.velocity.z + slowImpulse);
          }
        }
      } else {
        // Post-finish smooth coasting deceleration in catch basin
        r.body.applyForce(new CANNON.Vec3(-vx * 2.5, 0, -vz * 1.8));
      }

      // Sync rolling spin feel if lateral contacts slightly twist velocity
      if (vz > 0.2) {
        r.body.angularVelocity.x = vz / MARBLE_RADIUS;
      }
    }

    this.world.step(fixedDt);

    // Post-step checks: top speed, finish line crossings, live order events
    let allFinished = true;
    for (const r of this.racers) {
      const z = r.body.position.z;
      const speed = Math.hypot(r.body.velocity.x, r.body.velocity.y, r.body.velocity.z);
      if (speed > r.topSpeedReached && !r.finished) {
        r.topSpeedReached = speed;
      }

      // Finish line crossing with sub-tick linear interpolation
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

    // Lead change detection (only after 4m so start scatter isn't noisy)
    if (leader.body.position.z > 4 && !leader.finished) {
      if (this.currentLeaderId && this.currentLeaderId !== leader.input.marble.id) {
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

    // Mid-pack overtakes (rate-limited so commentary stays readable)
    if (
      this.prevOrderIds.length === orderIds.length &&
      this.elapsedSeconds - this.lastOvertakeEventTime > 1.35 &&
      leader.body.position.z > 8 &&
      leader.body.position.z < this.config.trackLengthMeters - 3
    ) {
      for (let i = 1; i < ordered.length; i++) {
        const racer = ordered[i];
        if (racer.finished) continue;
        const prevIdx = this.prevOrderIds.indexOf(racer.input.marble.id);
        if (prevIdx > i) {
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
            break;
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
    return [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) {
        return (a.finishTimeSeconds ?? 0) - (b.finishTimeSeconds ?? 0);
      }
      if (a.finished) return -1;
      if (b.finished) return 1;
      const zDiff = b.body.position.z - a.body.position.z;
      if (Math.abs(zDiff) > 1e-5) return zDiff;
      return a.input.lane - b.input.lane;
    });
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
