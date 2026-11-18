import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialLeagueState, DEFAULT_LEAGUE_SEED} from '../roster';
import {selectTeamRepresentatives} from '../scoring';
import {FIXED_PHYSICS_DT, SprintCompetitorInput, SprintSimulation} from '../sprintSimulation';

function runHeadlessSprint(seed: number) {
  const state = createInitialLeagueState(DEFAULT_LEAGUE_SEED);
  const venue = state.venues['venue_velocity_park'];
  const competitors: SprintCompetitorInput[] = state.teamOrder.map((teamId, idx) => {
    const team = state.teams[teamId];
    const [rep] = selectTeamRepresentatives(team, state.marbles, 'Sprint');
    return {marble: rep, team, lane: idx + 1};
  });

  const sim = new SprintSimulation(competitors, venue.sprintConfig!, seed);
  sim.startRace();

  let ticks = 0;
  const maxTicks = 120 * 25; // max 25 seconds simulated
  while (!sim.isFinished() && ticks < maxTicks) {
    sim.step(FIXED_PHYSICS_DT);
    ticks++;
  }
  return {sim, snapshot: sim.getSnapshot(), events: sim.getEvents()};
}

test('Sprint simulation finishes cleanly with all 8 marbles crossing the finish line', () => {
  const {snapshot, events} = runHeadlessSprint(4242);
  assert.equal(snapshot.finished, true);
  assert.equal(snapshot.racers.length, 8);
  for (const r of snapshot.racers) {
    assert.equal(r.finished, true, `${r.name} failed to finish`);
    assert.ok(
      r.finishTimeSeconds !== null && r.finishTimeSeconds > 5 && r.finishTimeSeconds < 15,
      `${r.name} finish time ${r.finishTimeSeconds}s out of realistic range`,
    );
    assert.ok(r.topSpeedReached > 9 && r.topSpeedReached < 16, `${r.name} top speed ${r.topSpeedReached}`);
  }
  assert.ok(events.some((e) => e.type === 'RACE_START'));
  assert.ok(events.some((e) => e.type === 'RACE_FINISH'));
});

test('Sprint simulation is 100% deterministic for identical seed and initial conditions', () => {
  const runA = runHeadlessSprint(9001);
  const runB = runHeadlessSprint(9001);

  assert.deepEqual(
    runA.snapshot.racers.map((r) => ({
      id: r.marbleId,
      rank: r.liveRank,
      time: r.finishTimeSeconds,
    })),
    runB.snapshot.racers.map((r) => ({
      id: r.marbleId,
      rank: r.liveRank,
      time: r.finishTimeSeconds,
    })),
  );
});

test('Different seeds produce emergent variance rather than identical scripted finishes', () => {
  const winners = new Set<string>();
  const firstPlaceTimes = new Set<number>();
  for (const seed of [101, 202, 303, 404, 505, 606]) {
    const {snapshot} = runHeadlessSprint(seed);
    const winner = snapshot.racers.find((r) => r.liveRank === 1)!;
    winners.add(winner.marbleId);
    firstPlaceTimes.add(Number(winner.finishTimeSeconds!.toFixed(3)));
  }
  assert.ok(firstPlaceTimes.size >= 4, 'Different seeds should yield varying finish times');
  assert.ok(winners.size >= 2, 'Different seeds should allow competitive variety rather than a single scripted winner');
});
