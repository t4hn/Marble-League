/**
 * Centralised, inspectable physics & competitive balancing configuration for the
 * Marble League Sprint simulation.
 *
 * Every simulation run uses a deterministic fixed timestep (FIXED_PHYSICS_DT = 1/120s)
 * and consumes randomness exclusively from the race's seeded PRNG.
 */
export interface SprintPhysicsConfig {
  /** Fixed simulation timestep in seconds (120 Hz). */
  fixedDt: number;
  /** Standard competition marble radius in metres. */
  marbleRadius: number;
  /** Standard competition marble mass in kg. */
  marbleMass: number;
  /** Gravitational acceleration vector Y in m/s^2. */
  gravityY: number;
  /** Cannon-es Gauss-Seidel solver iterations per tick. */
  solverIterations: number;

  /** Contact materials governing rolling grip and collision restitution. */
  materials: {
    marbleTrack: {friction: number; restitution: number};
    marbleRail: {friction: number; restitution: number};
    marbleMarble: {friction: number; restitution: number};
  };

  /** Rigid-body baseline damping (kept low so gravity & aero drag dominate). */
  damping: {
    linear: number;
    angular: number;
  };

  /** Track geometry & divider transition distances. */
  track: {
    /** Inner lane dividers run from -3m to rampLengthMeters + launchChuteExtensionMeters. */
    launchChuteExtensionMeters: number;
    /** Height of the inner launch-chute dividers in metres. */
    innerDividerHeight: number;
    /** Height of the full-length outer containment guard walls in metres. */
    outerWallHeight: number;
  };

  /** Gate release and propulsion / drag model. */
  propulsion: {
    /** Baseline launch speed at gate drop (m/s). */
    baseGateSpeed: number;
    /** Seeded gate reaction speed jitter (± fraction). */
    gateJitterFraction: number;
    /** Forward gravity-assisted rolling drive on launch ramp (N). */
    rampDriveForce: number;
    /** Forward sustained drive along main straightaway (N). */
    mainDriveForce: number;
    /** Quadratic aerodynamic drag base coefficient (N / (m/s)^2). */
    aeroDragCoeff: number;
    /** Linear rolling resistance coefficient (N / (m/s)), modulated by Handling. */
    rollingResistance: number;
  };

  /** Slipstream drafting zone behind a leading marble on the open straightaway. */
  drafting: {
    minGapMeters: number;
    maxGapMeters: number;
    maxLateralOffsetMeters: number;
    /** Maximum drag reduction factor (0..1) when directly in a slipstream. */
    maxDragReduction: number;
    /** Gentle lateral pull toward nearby clean/draft line (N). */
    slipstreamPullForce: number;
  };

  /** Soft lane guidance on the open straightaway (subtle enough to permit collisions). */
  laneGuidance: {
    /** Spring stiffness inside launch chute (before dividers end). */
    chuteSpringK: number;
    chuteDamping: number;
    /** Very gentle restoring force on open straightaway so marbles still race in packs. */
    openSpringK: number;
    openDamping: number;
    /** Outer track margin nudge near guard walls to avoid prolonged rail grinding. */
    wallBufferMeters: number;
    wallRepelForce: number;
  };

  /** Attribute weighting curves (attribute inputs span ~52..92, centred around 70). */
  attributes: {
    /** Acceleration -> gate launch & ramp propulsion sensitivity. */
    accelSensitivity: number;
    /** TopSpeed -> aerodynamic drag reduction sensitivity (higher SPD = lower aero drag). */
    topSpeedAeroSensitivity: number;
    /** Handling -> rolling efficiency, scrub recovery & slipstream agility. */
    handlingSensitivity: number;
    /** Stability -> seam impulse absorption & turbulence/collision composure. */
    stabilitySensitivity: number;
  };

  /** Track seam & race-to-race micro-turbulence settings. */
  variance: {
    /** Baseline lateral seam impulse scale. */
    seamLateralScale: number;
    /** Baseline longitudinal drag impulse scale at seams. */
    seamDragScale: number;
    /** Deterministic micro-gust amplitude along straightaway (N). */
    gustForceAmplitude: number;
  };

  /** Collision telemetry thresholds. */
  telemetry: {
    /** Relative impact speed (m/s) considered a notable broadcast contact. */
    significantImpactSpeed: number;
    /** Window (seconds) after contact during which a rank change counts as collision-linked. */
    collisionRankWindowSeconds: number;
    /** Longitudinal separation (m) defining close-pack racing. */
    closePackMeters: number;
  };
}

export const SPRINT_PHYSICS_CONFIG: SprintPhysicsConfig = {
  fixedDt: 1 / 120,
  marbleRadius: 0.24,
  marbleMass: 1.0,
  gravityY: -9.81,
  solverIterations: 6,

  materials: {
    // High enough track friction so marbles grip and spin naturally without slipping
    marbleTrack: {friction: 0.3, restitution: 0.08},
    // Low-friction outer rails so glancing contact deflects cleanly instead of sticking
    marbleRail: {friction: 0.04, restitution: 0.34},
    // Authentic glass-on-glass clack restitution without chaotic pinball explosions
    marbleMarble: {friction: 0.045, restitution: 0.62},
  },

  damping: {
    linear: 0.014,
    angular: 0.014,
  },

  track: {
    launchChuteExtensionMeters: 1.5,
    innerDividerHeight: 0.32,
    outerWallHeight: 0.8,
  },

  propulsion: {
    baseGateSpeed: 1.4,
    gateJitterFraction: 0.16,
    rampDriveForce: 3.55,
    mainDriveForce: 3.1,
    aeroDragCoeff: 0.0172,
    rollingResistance: 0.075,
  },

  drafting: {
    minGapMeters: 0.65,
    maxGapMeters: 4.8,
    maxLateralOffsetMeters: 1.35,
    maxDragReduction: 0.28,
    slipstreamPullForce: 0.36,
  },

  laneGuidance: {
    chuteSpringK: 3.4,
    chuteDamping: 1.5,
    // Very gentle open-track guidance so marbles roam, draft, collide, and swap lines naturally
    openSpringK: 0.09,
    openDamping: 0.26,
    wallBufferMeters: 0.38,
    wallRepelForce: 0.95,
  },

  attributes: {
    // Balanced calibration: ACC+SPD lead straight-line sprint pace while HND+STB
    // meaningfully reward clean lines, draft agility, and seam/collision composure
    accelSensitivity: 0.0032,
    topSpeedAeroSensitivity: 0.0037,
    handlingSensitivity: 0.0062,
    stabilitySensitivity: 0.0075,
  },

  variance: {
    seamLateralScale: 1.05,
    seamDragScale: 0.88,
    gustForceAmplitude: 0.44,
  },

  telemetry: {
    significantImpactSpeed: 0.42,
    collisionRankWindowSeconds: 1.5,
    closePackMeters: 1.1,
  },
};
