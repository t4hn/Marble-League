import {SprintLayoutConfig} from '../types/league';
import {getSprintTrackSurfaceY} from './sprintSimulation';

export type CameraViewMode = 'broadcast' | 'overhead' | 'finish' | 'gate';

export const DEFAULT_CAMERA_MODE: CameraViewMode = 'overhead';

export type CountdownStageId = 'ready' | '3' | '2' | '1' | 'go';

export interface CountdownStageSpec {
  id: CountdownStageId;
  label: string;
  offsetMs: number;
  durationMs: number;
  lampState: 'ready' | '3' | '2' | '1' | 'go';
  isGo: boolean;
}

/**
 * Deliberate ~5-second broadcast starting sequence:
 * - READY: 1.5s
 * - 3:     1.0s
 * - 2:     1.0s
 * - 1:     1.0s
 * - GO:    Race starts at 4.5s (overlay lingers 0.75s -> ~5.25s total)
 */
export const SPRINT_COUNTDOWN_SCHEDULE: readonly CountdownStageSpec[] = [
  {id: 'ready', label: 'READY', offsetMs: 0, durationMs: 1500, lampState: 'ready', isGo: false},
  {id: '3', label: '3', offsetMs: 1500, durationMs: 1000, lampState: '3', isGo: false},
  {id: '2', label: '2', offsetMs: 2500, durationMs: 1000, lampState: '2', isGo: false},
  {id: '1', label: '1', offsetMs: 3500, durationMs: 1000, lampState: '1', isGo: false},
  {id: 'go', label: 'GO', offsetMs: 4500, durationMs: 750, lampState: 'go', isGo: true},
];

export const COUNTDOWN_GO_OFFSET_MS = 4500;
export const COUNTDOWN_HIDE_OFFSET_MS = 5250;

export interface PackCameraMetrics {
  minZ: number;
  maxZ: number;
  centerZ: number;
  spanZ: number;
}

export interface CameraTargetPose {
  posX: number;
  posY: number;
  posZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
}

/**
 * Computes clamped pack bounds across all competitors so finished leaders never
 * drop out of the average and cause sudden backward camera jumps.
 */
export function computePackCameraMetrics(
  zPositions: readonly number[],
  trackLengthMeters: number,
): PackCameraMetrics {
  if (zPositions.length === 0) {
    return {minZ: -0.3, maxZ: -0.3, centerZ: -0.3, spanZ: 0};
  }
  const maxClamp = trackLengthMeters + 2.0;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let sumZ = 0;

  for (let i = 0; i < zPositions.length; i++) {
    const z = Math.min(maxClamp, zPositions[i]);
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    sumZ += z;
  }

  const centerZ = sumZ / zPositions.length;
  return {
    minZ,
    maxZ,
    centerZ,
    spanZ: Math.max(0, maxZ - minZ),
  };
}

/**
 * Pure camera pose solver for all four broadcast camera presets.
 * Ensures clear marble/gate/finish framing and track-surface clearance at every stage.
 */
export function computeBroadcastCameraPose(
  mode: CameraViewMode,
  metrics: PackCameraMetrics,
  config: SprintLayoutConfig,
): CameraTargetPose {
  const trackLen = config.trackLengthMeters;

  switch (mode) {
    case 'overhead': {
      // Smoothly expands elevation & pullback when the pack spreads so all competitors remain framed
      const focusZ = Math.min(trackLen + 1.0, metrics.centerZ);
      const yTrack = getSprintTrackSurfaceY(focusZ, config);
      const spreadBoost = Math.min(4.8, metrics.spanZ * 0.34);
      const height = 12.6 + spreadBoost;
      const zBack = -4.6 - Math.min(2.4, metrics.spanZ * 0.14);
      return {
        posX: 0,
        posY: yTrack + height,
        posZ: focusZ + zBack,
        lookX: 0,
        lookY: yTrack + 0.15,
        lookZ: focusZ + 3.6,
      };
    }

    case 'broadcast': {
      // High 3/4 crane follow perspective anchored to the leading group + trailing pack
      const leadPackZ = Math.min(
        trackLen + 1.2,
        metrics.maxZ * 0.62 + metrics.centerZ * 0.38,
      );
      const yTrack = getSprintTrackSurfaceY(leadPackZ, config);
      const spreadBoost = Math.min(2.8, metrics.spanZ * 0.22);
      const camZ = leadPackZ - 8.4 - spreadBoost;
      const camDeckY = getSprintTrackSurfaceY(camZ, config);
      const posY = Math.max(yTrack, camDeckY) + 3.8 + Math.min(2.0, metrics.spanZ * 0.12);
      return {
        posX: 4.7,
        posY,
        posZ: camZ,
        lookX: 0,
        lookY: yTrack + 0.35,
        lookZ: Math.min(trackLen + 2.5, leadPackZ + 2.2),
      };
    }

    case 'finish': {
      // Reverse photo-finish angle looking cleanly beneath the checkered arch toward incoming pack
      const fy = getSprintTrackSurfaceY(trackLen, config);
      const approachWeight =
        metrics.maxZ > trackLen - 24
          ? Math.min(1, Math.max(0, (metrics.maxZ - (trackLen - 24)) / 24))
          : 0;
      const lookZ = trackLen - 8.5 + approachWeight * 5.8;
      const lookY = getSprintTrackSurfaceY(lookZ, config) + 0.35;
      return {
        posX: 3.25,
        posY: fy + 2.9,
        posZ: trackLen + 9.2,
        lookX: 0,
        lookY,
        lookZ,
      };
    }

    case 'gate': {
      // Prominent view of the starting gate gantry, light pods, and full 8-marble launch grid
      const gy = getSprintTrackSurfaceY(0, config);
      const launchBias = Math.min(1, Math.max(0, metrics.centerZ / 6));
      const lookZ = -0.1 + launchBias * 1.4;
      return {
        posX: -4.1,
        posY: gy + 2.15,
        posZ: 6.1,
        lookX: 0,
        lookY: gy + 0.72,
        lookZ,
      };
    }
  }
}

/**
 * Prevents mid-transition camera arcs from clipping through the track deck or side rails.
 */
export function clampCameraAboveTrack(
  posX: number,
  posY: number,
  posZ: number,
  config: SprintLayoutConfig,
): number {
  const halfTrackWidth = config.laneWidthMeters * 4 + 1.1;
  if (Math.abs(posX) <= halfTrackWidth && posZ >= -4.5 && posZ <= config.trackLengthMeters + 16) {
    const minSafeY = getSprintTrackSurfaceY(posZ, config) + 1.35;
    return Math.max(posY, minSafeY);
  }
  return posY;
}
