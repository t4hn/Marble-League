import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialLeagueState, DEFAULT_LEAGUE_SEED} from '../roster';
import {scoreRaceEvent, selectTeamRepresentatives} from '../scoring';
import {
  commitRaceResultToLeague,
  renameMarbleDisplayName,
  renameTeamDisplayName,
  resetCurrentSeason,
  updateTeamLogo,
} from '../storage';
import {
  clampCameraAboveTrack,
  computeBroadcastCameraPose,
  computePackCameraMetrics,
  COUNTDOWN_GO_OFFSET_MS,
  DEFAULT_CAMERA_MODE,
  SPRINT_COUNTDOWN_SCHEDULE,
} from '../broadcastConfig';
import {getSprintTrackSurfaceY} from '../sprintSimulation';
import {RaceEventResult} from '../../types/league';

function buildFakeCompletedResult(
  state: ReturnType<typeof createInitialLeagueState>,
  roundNumber: number,
  seed: number,
): RaceEventResult {
  const round = state.calendar.find((r) => r.roundNumber === roundNumber)!;
  const rawFinishers = state.teamOrder.map((teamId, idx) => {
    const team = state.teams[teamId];
    const [rep] = selectTeamRepresentatives(team, state.marbles, 'Sprint');
    return {
      marbleId: rep.id,
      teamId,
      lane: idx + 1,
      finishTimeSeconds: 9.4 + idx * 0.08,
      topSpeedReached: 11.2 - idx * 0.05,
    };
  });
  const scored = scoreRaceEvent(rawFinishers, state.teamOrder);
  return {
    eventId: `s${state.currentSeasonNumber}_r${roundNumber}_${seed}`,
    seasonNumber: state.currentSeasonNumber,
    roundNumber,
    discipline: round.discipline,
    venueId: round.venueId,
    seed,
    completedAtIso: '2026-11-18T00:00:00.000Z',
    fieldSize: 8,
    marbleResults: scored.marbleResults,
    teamScores: scored.teamScores,
    commentaryHighlights: [],
  };
}

test('resetCurrentSeason resets calendar to Round 1 while preserving teams, marbles, logos, career stats, and archives', () => {
  let state = createInitialLeagueState(DEFAULT_LEAGUE_SEED);

  // Customize team name, custom logo, and marble name
  state = renameTeamDisplayName(state, 'team_velocity_vipers', 'Apex Vipers Custom');
  state = updateTeamLogo(state, 'team_velocity_vipers', 'data:image/png;base64,CUSTOMLOGO');
  state = renameMarbleDisplayName(state, 'marble_vex', 'Vex Prime');

  const originalAttrs = {...state.marbles['marble_vex'].attributes};

  // Complete all 8 rounds so Season 1 is archived and career stats are populated
  for (let r = 1; r <= 8; r++) {
    state = commitRaceResultToLeague(state, buildFakeCompletedResult(state, r, 1000 + r));
  }

  assert.equal(state.seasonHistory.length, 1);
  assert.equal(state.calendar.every((r) => r.status === 'completed'), true);
  const careerPointsBefore = state.teams['team_velocity_vipers'].stats.totalChampionshipPoints;
  const careerAppearancesBefore = state.marbles['marble_vex'].stats.appearances;
  assert.ok(careerPointsBefore > 0);
  assert.ok(careerAppearancesBefore > 0);

  // Perform administrative current-season reset
  const reset = resetCurrentSeason(state);

  // Calendar is completely reset to Round 1 scheduled
  assert.equal(reset.calendar.length, 8);
  assert.equal(reset.calendar[0].roundNumber, 1);
  assert.equal(reset.calendar.every((r) => r.status === 'scheduled' && r.result === null), true);

  // Preserved league universe
  assert.equal(reset.currentSeasonNumber, state.currentSeasonNumber);
  assert.equal(reset.teamOrder.length, 8);
  assert.equal(reset.marbleOrder.length, 32);
  assert.equal(reset.teams['team_velocity_vipers'].name, 'Apex Vipers Custom');
  assert.equal(reset.teams['team_velocity_vipers'].logoDataUrl, 'data:image/png;base64,CUSTOMLOGO');
  assert.equal(reset.marbles['marble_vex'].name, 'Vex Prime');
  assert.deepEqual(reset.marbles['marble_vex'].attributes, originalAttrs);
  assert.equal(reset.teams['team_velocity_vipers'].stats.totalChampionshipPoints, careerPointsBefore);
  assert.equal(reset.marbles['marble_vex'].stats.appearances, careerAppearancesBefore);
  assert.equal(reset.seasonHistory.length, 1);
  assert.equal(reset.venues['venue_velocity_park'].trackRecord !== null, true);

  // Replaying an already-archived season updates rather than duplicates the archive
  let replayed = reset;
  for (let r = 1; r <= 8; r++) {
    replayed = commitRaceResultToLeague(replayed, buildFakeCompletedResult(replayed, r, 2000 + r));
  }
  assert.equal(replayed.seasonHistory.length, 1);
});

test('updateTeamLogo associates logos by permanent team ID and supports restore to default', () => {
  let state = createInitialLeagueState(DEFAULT_LEAGUE_SEED);
  const originalStats = {...state.teams['team_static_storm'].stats};

  state = updateTeamLogo(state, 'team_static_storm', 'data:image/webp;base64,TESTDATA');
  assert.equal(state.teams['team_static_storm'].logoDataUrl, 'data:image/webp;base64,TESTDATA');
  assert.deepEqual(state.teams['team_static_storm'].stats, originalStats);

  // Renaming the team preserves logo tied to permanent ID
  state = renameTeamDisplayName(state, 'team_static_storm', 'Storm Front');
  assert.equal(state.teams['team_static_storm'].logoDataUrl, 'data:image/webp;base64,TESTDATA');

  // Restoring default clears logoDataUrl cleanly
  state = updateTeamLogo(state, 'team_static_storm', null);
  assert.equal(state.teams['team_static_storm'].logoDataUrl, undefined);
  assert.equal(state.teams['team_static_storm'].name, 'Storm Front');
});

test('default camera is overhead and countdown spans ~5 seconds with GO at 4.5s', () => {
  assert.equal(DEFAULT_CAMERA_MODE, 'overhead');
  assert.deepEqual(
    SPRINT_COUNTDOWN_SCHEDULE.map((s) => [s.label, s.durationMs]),
    [
      ['READY', 1500],
      ['3', 1000],
      ['2', 1000],
      ['1', 1000],
      ['GO', 750],
    ],
  );
  assert.equal(COUNTDOWN_GO_OFFSET_MS, 4500);
});

test('broadcast camera poses maintain track clearance and smooth clamped pack metrics at finish', () => {
  const state = createInitialLeagueState(DEFAULT_LEAGUE_SEED);
  const config = state.venues['venue_velocity_park'].sprintConfig!;

  // Pack metrics clamp post-finish overshoot so camera never snaps backward when leader finishes
  const preFinish = computePackCameraMetrics([79, 77, 76, 75, 74, 73, 72, 71], config.trackLengthMeters);
  const postFinish = computePackCameraMetrics([88, 79, 78, 77, 76, 75, 74, 73], config.trackLengthMeters);
  assert.ok(postFinish.centerZ >= preFinish.centerZ);

  for (const zList of [
    [-0.3, -0.3, -0.3, -0.3, -0.3, -0.3, -0.3, -0.3],
    [15, 14, 13.5, 13, 12.2, 11.8, 11.1, 10.5],
    [79.5, 78.2, 77.6, 76.9, 76.1, 75.4, 74.8, 74.1],
  ]) {
    const metrics = computePackCameraMetrics(zList, config.trackLengthMeters);
    for (const mode of ['overhead', 'broadcast', 'finish', 'gate'] as const) {
      const pose = computeBroadcastCameraPose(mode, metrics, config);
      const trackY = getSprintTrackSurfaceY(pose.posZ, config);
      const safeY = clampCameraAboveTrack(pose.posX, pose.posY, pose.posZ, config);
      assert.equal(safeY, pose.posY, `${mode} camera should stay clear above track deck`);
      assert.ok(pose.posY > trackY + 1.3, `${mode} camera clearance violation`);
    }
  }
});
