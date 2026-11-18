import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialLeagueState, DEFAULT_LEAGUE_SEED} from '../roster';
import {selectTeamRepresentatives} from '../scoring';
import {
  FIXED_PHYSICS_DT,
  getSprintLaneCenterX,
  MARBLE_RADIUS,
  SprintCompetitorInput,
  SprintSimulation,
} from '../sprintSimulation';
import {SPRINT_PHYSICS_CONFIG} from '../sprintConfig';

function buildSprintCompetitors(): SprintCompetitorInput[] {
  const state = createInitialLeagueState(DEFAULT_LEAGUE_SEED);
  return state.teamOrder.map((teamId, idx) => {
    const team = state.teams[teamId];
    const [rep] = selectTeamRepresentatives(team, state.marbles, 'Sprint');
    return {marble: rep, team, lane: idx + 1};
  });
}

function runHeadlessSprint(
  seed: number,
  venueId: 'venue_velocity_park' | 'venue_stratos_straight' = 'venue_velocity_park',
) {
  const state = createInitialLeagueState(DEFAULT_LEAGUE_SEED);
  const venue = state.venues[venueId];
  const competitors = buildSprintCompetitors();

  const sim = new SprintSimulation(competitors, venue.sprintConfig!, seed);
  sim.startRace();

  let ticks = 0;
  const maxTicks = 120 * 25; // max 25 seconds simulated
  while (!sim.isFinished() && ticks < maxTicks) {
    sim.step(FIXED_PHYSICS_DT);
    ticks++;
  }
  return {
    sim,
    snapshot: sim.getSnapshot(),
    events: sim.getEvents(),
    telemetry: sim.getTelemetry(),
  };
}

test('Sprint simulation finishes cleanly across both venues with zero stuck or escaped marbles', () => {
  for (const venueId of ['venue_velocity_park', 'venue_stratos_straight'] as const) {
    const {snapshot, events, telemetry} = runHeadlessSprint(4242, venueId);
    assert.equal(snapshot.finished, true);
    assert.equal(telemetry.stuckCount, 0);
    assert.equal(telemetry.escapedCount, 0);
    assert.equal(snapshot.racers.length, 8);
    for (const r of snapshot.racers) {
      assert.equal(r.finished, true, `${r.name} failed to finish at ${venueId}`);
      assert.ok(
        r.finishTimeSeconds !== null && r.finishTimeSeconds > 5 && r.finishTimeSeconds < 16,
        `${r.name} finish time ${r.finishTimeSeconds}s out of realistic range`,
      );
      assert.ok(
        r.topSpeedReached > 9 && r.topSpeedReached < 15,
        `${r.name} top speed ${r.topSpeedReached}`,
      );
      const outerLimit = 4 * 0.92 + 0.15;
      assert.ok(
        Math.abs(r.position.x) <= outerLimit,
        `${r.name} escaped lateral bounds: x=${r.position.x}`,
      );
    }
    assert.ok(events.some((e) => e.type === 'RACE_START'));
    assert.ok(events.some((e) => e.type === 'RACE_FINISH'));
  }
});

test('Gravity accelerates marbles downhill and track friction couples spin naturally to linear velocity', () => {
  const state = createInitialLeagueState(DEFAULT_LEAGUE_SEED);
  const venue = state.venues['venue_velocity_park'];
  const competitors = buildSprintCompetitors();
  const sim = new SprintSimulation(competitors, venue.sprintConfig!, 5150);
  sim.startRace();

  // Step 1.5s down the ramp
  for (let i = 0; i < 180; i++) {
    sim.step(FIXED_PHYSICS_DT);
  }
  const midRamp = sim.getSnapshot();
  const rollingAfterRamp = sim.getAngularRollingCheck();

  for (const r of midRamp.racers) {
    assert.ok(r.velocity.z > 4.0, `${r.name} should accelerate down launch ramp (vz=${r.velocity.z})`);
    assert.ok(r.position.z > 3.0, `${r.name} should advance down track (z=${r.position.z})`);
  }

  // Natural rolling coupling: angularVelocity.x * R tracks linear velocity.z without forced spin overrides
  for (const rc of rollingAfterRamp) {
    const ratio = rc.spinXR / Math.max(0.1, rc.linearZ);
    assert.ok(
      ratio > 0.75 && ratio < 1.25,
      `Expected natural rolling coupling omega*R ≈ vz for ${rc.marbleId}, got ${rc.spinXR.toFixed(2)} vs ${rc.linearZ.toFixed(2)}`,
    );
  }

  // Step further to 4.5s on main straightaway and confirm sustained rolling equilibrium
  for (let i = 0; i < 360; i++) {
    sim.step(FIXED_PHYSICS_DT);
  }
  const rollingMain = sim.getAngularRollingCheck();
  for (const rc of rollingMain) {
    const ratio = rc.spinXR / Math.max(0.1, rc.linearZ);
    assert.ok(
      ratio > 0.85 && ratio < 1.15,
      `Expected steady rolling spin ratio near 1.0 on straightaway, got ${ratio.toFixed(3)}`,
    );
  }
});

test('Open straightaway permits authentic marble-to-marble collisions and momentum transfer', () => {
  const state = createInitialLeagueState(DEFAULT_LEAGUE_SEED);
  const config = {...state.venues['venue_velocity_park'].sprintConfig!, surfaceRoughness: 0.9, seamCount: 14};
  const competitors = buildSprintCompetitors();

  // Run a short set of races with rough seams + closer adjacent lanes to verify physical contact occurs
  let observedCollisions = 0;
  for (const seed of [111, 222, 333, 444, 555, 666, 777, 888]) {
    const sim = new SprintSimulation(competitors, config, seed);
    sim.startRace();
    for (let t = 0; t < 120 * 20 && !sim.isFinished(); t++) {
      sim.step(FIXED_PHYSICS_DT);
    }
    const tel = sim.getTelemetry();
    observedCollisions += tel.marbleCollisions;
    assert.equal(tel.stuckCount, 0);
    assert.equal(tel.escapedCount, 0);
  }
  assert.ok(
    observedCollisions > 0,
    `Expected real marble-to-marble collisions across open-straightaway races, got ${observedCollisions}`,
  );
});

test('Sprint simulation is 100% deterministic for identical seed and frame-rate-independent via fixed timestep', () => {
  const runA = runHeadlessSprint(9001);
  const runB = runHeadlessSprint(9001);

  assert.deepEqual(
    runA.snapshot.racers.map((r) => ({
      id: r.marbleId,
      rank: r.liveRank,
      time: r.finishTimeSeconds,
      topSpeed: r.topSpeedReached,
    })),
    runB.snapshot.racers.map((r) => ({
      id: r.marbleId,
      rank: r.liveRank,
      time: r.finishTimeSeconds,
      topSpeed: r.topSpeedReached,
    })),
  );
  assert.deepEqual(runA.telemetry, runB.telemetry);

  // Verify lane-center helper alignment with marble radius
  assert.ok(
    Math.abs(getSprintLaneCenterX(1, 0.92)) + MARBLE_RADIUS < 4 * 0.92,
    'Outer lane marble must sit cleanly inside guard rail',
  );
  assert.equal(SPRINT_PHYSICS_CONFIG.fixedDt, FIXED_PHYSICS_DT);
});

test('Different seeds produce emergent variance rather than identical scripted finishes', () => {
  const winners = new Set<string>();
  const firstPlaceTimes = new Set<number>();
  for (const seed of [101, 202, 303, 404, 505, 606, 707, 808]) {
    const {snapshot} = runHeadlessSprint(seed);
    const winner = snapshot.racers.find((r) => r.liveRank === 1)!;
    winners.add(winner.marbleId);
    firstPlaceTimes.add(Number(winner.finishTimeSeconds!.toFixed(3)));
  }
  assert.ok(firstPlaceTimes.size >= 5, 'Different seeds should yield varying finish times');
  assert.ok(
    winners.size >= 3,
    `Different seeds should yield diverse winners across the field (got ${winners.size})`,
  );
});
