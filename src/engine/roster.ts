import {
  CalendarRound,
  Discipline,
  DisciplineRecord,
  LeagueState,
  Marble,
  MarbleAttributes,
  MarbleStats,
  Team,
  Venue,
} from '../types/league';
import {createSeededRng} from './prng';

export const DEFAULT_LEAGUE_SEED = 202601;

interface SeedTeamDef {
  id: string;
  name: string;
  shortCode: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  identity: string;
  emblemType: Team['emblemType'];
  marbles: Array<{
    id: string;
    name: string;
    baseline: MarbleAttributes;
  }>;
}

/**
 * Approved 8 franchises and 32 marbles from League Bible §9.
 * Baseline values are subject to the deterministic balancing pass below,
 * which preserves team identities and individual archetypes while tightening
 * extreme outliers (such as 4th-marble deficits and sprinter gaps).
 */
const APPROVED_ROSTER_DEFINITIONS: SeedTeamDef[] = [
  {
    id: 'team_velocity_vipers',
    name: 'Velocity Vipers',
    shortCode: 'VLV',
    primaryColor: '#10b981',
    secondaryColor: '#111827',
    accentColor: '#6ee7b7',
    identity: 'Fast, aggressive and technically sharp. The pace-setters.',
    emblemType: 'viper',
    marbles: [
      {id: 'marble_vex', name: 'Vex', baseline: {acceleration: 88, topSpeed: 84, handling: 62, stability: 58}},
      {id: 'marble_nitro', name: 'Nitro', baseline: {acceleration: 63, topSpeed: 66, handling: 88, stability: 76}},
      {id: 'marble_venom', name: 'Venom', baseline: {acceleration: 61, topSpeed: 64, handling: 72, stability: 90}},
      {id: 'marble_dash', name: 'Dash', baseline: {acceleration: 68, topSpeed: 66, handling: 66, stability: 64}},
    ],
  },
  {
    id: 'team_midnight_meteors',
    name: 'Midnight Meteors',
    shortCode: 'MDM',
    primaryColor: '#1e3a8a',
    secondaryColor: '#cbd5e1',
    accentColor: '#93c5fd',
    identity: 'Cool, composed and consistent. The professionals.',
    emblemType: 'meteor',
    marbles: [
      {id: 'marble_orion', name: 'Orion', baseline: {acceleration: 84, topSpeed: 88, handling: 58, stability: 62}},
      {id: 'marble_nova', name: 'Nova', baseline: {acceleration: 66, topSpeed: 62, handling: 84, stability: 80}},
      {id: 'marble_comet', name: 'Comet', baseline: {acceleration: 64, topSpeed: 60, handling: 76, stability: 88}},
      {id: 'marble_cosmo', name: 'Cosmo', baseline: {acceleration: 66, topSpeed: 74, handling: 70, stability: 58}},
    ],
  },
  {
    id: 'team_rumble_rams',
    name: 'Rumble Rams',
    shortCode: 'RMR',
    primaryColor: '#ea580c',
    secondaryColor: '#27272a',
    accentColor: '#fdba74',
    identity: 'Physical competitors who thrive in traffic and collisions. The wrecking crew.',
    emblemType: 'ram',
    marbles: [
      {id: 'marble_boulder', name: 'Boulder', baseline: {acceleration: 62, topSpeed: 60, handling: 72, stability: 94}},
      {id: 'marble_riot', name: 'Riot', baseline: {acceleration: 86, topSpeed: 78, handling: 66, stability: 58}},
      {id: 'marble_bruiser', name: 'Bruiser', baseline: {acceleration: 64, topSpeed: 66, handling: 84, stability: 78}},
      {id: 'marble_crash', name: 'Crash', baseline: {acceleration: 68, topSpeed: 76, handling: 58, stability: 70}},
    ],
  },
  {
    id: 'team_static_storm',
    name: 'Static Storm',
    shortCode: 'STS',
    primaryColor: '#7c3aed',
    secondaryColor: '#f8fafc',
    accentColor: '#c4b5fd',
    identity: 'Unpredictable, occasionally brilliant and difficult to read. The chaos merchants.',
    emblemType: 'storm',
    marbles: [
      {id: 'marble_voltage', name: 'Voltage', baseline: {acceleration: 90, topSpeed: 82, handling: 60, stability: 56}},
      {id: 'marble_flicker', name: 'Flicker', baseline: {acceleration: 64, topSpeed: 70, handling: 90, stability: 64}},
      {id: 'marble_surge', name: 'Surge', baseline: {acceleration: 62, topSpeed: 64, handling: 70, stability: 90}},
      {id: 'marble_glitch', name: 'Glitch', baseline: {acceleration: 64, topSpeed: 64, handling: 60, stability: 70}},
    ],
  },
  {
    id: 'team_crimson_comets',
    name: 'Crimson Comets',
    shortCode: 'CRC',
    primaryColor: '#dc2626',
    secondaryColor: '#111827',
    accentColor: '#fca5a5',
    identity: 'High-performance specialists with a reputation for spectacular finishes. The show-offs.',
    emblemType: 'comet',
    marbles: [
      {id: 'marble_blaze', name: 'Blaze', baseline: {acceleration: 86, topSpeed: 90, handling: 58, stability: 58}},
      {id: 'marble_flare', name: 'Flare', baseline: {acceleration: 60, topSpeed: 64, handling: 90, stability: 78}},
      {id: 'marble_ember', name: 'Ember', baseline: {acceleration: 64, topSpeed: 62, handling: 74, stability: 90}},
      {id: 'marble_rocket', name: 'Rocket', baseline: {acceleration: 70, topSpeed: 64, handling: 58, stability: 66}},
    ],
  },
  {
    id: 'team_turbo_turtles',
    name: 'Turbo Turtles',
    shortCode: 'TBT',
    primaryColor: '#0d9488',
    secondaryColor: '#f8fafc',
    accentColor: '#5eead4',
    identity: 'A slightly ironic name for a team that values consistency over flashy performances. The slow burners.',
    emblemType: 'turtle',
    marbles: [
      {id: 'marble_shelby', name: 'Shelby', baseline: {acceleration: 62, topSpeed: 62, handling: 88, stability: 86}},
      {id: 'marble_turbo', name: 'Turbo', baseline: {acceleration: 84, topSpeed: 86, handling: 64, stability: 60}},
      {id: 'marble_tuck', name: 'Tuck', baseline: {acceleration: 66, topSpeed: 64, handling: 76, stability: 82}},
      {id: 'marble_moss', name: 'Moss', baseline: {acceleration: 68, topSpeed: 68, handling: 52, stability: 52}},
    ],
  },
  {
    id: 'team_golden_grizzlies',
    name: 'Golden Grizzlies',
    shortCode: 'GLG',
    primaryColor: '#d97706',
    secondaryColor: '#18181b',
    accentColor: '#fcd34d',
    identity: 'Strong all-round competitors with a no-nonsense reputation. The contenders.',
    emblemType: 'grizzly',
    marbles: [
      {id: 'marble_atlas', name: 'Atlas', baseline: {acceleration: 72, topSpeed: 72, handling: 84, stability: 84}},
      {id: 'marble_kodiak', name: 'Kodiak', baseline: {acceleration: 84, topSpeed: 80, handling: 64, stability: 60}},
      {id: 'marble_midas', name: 'Midas', baseline: {acceleration: 64, topSpeed: 68, handling: 82, stability: 78}},
      {id: 'marble_grumble', name: 'Grumble', baseline: {acceleration: 60, topSpeed: 60, handling: 50, stability: 58}},
    ],
  },
  {
    id: 'team_apex_antics',
    name: 'Apex Antics',
    shortCode: 'APA',
    primaryColor: '#2563eb',
    secondaryColor: '#f8fafc',
    accentColor: '#93c5fd',
    identity: 'Unconventional competitors with flashes of brilliance and occasional spectacular disasters. The wildcards.',
    emblemType: 'antics',
    marbles: [
      {id: 'marble_jinx', name: 'Jinx', baseline: {acceleration: 90, topSpeed: 86, handling: 58, stability: 54}},
      {id: 'marble_pogo', name: 'Pogo', baseline: {acceleration: 66, topSpeed: 64, handling: 90, stability: 74}},
      {id: 'marble_chaos', name: 'Chaos', baseline: {acceleration: 60, topSpeed: 68, handling: 72, stability: 92}},
      {id: 'marble_bingo', name: 'Bingo', baseline: {acceleration: 64, topSpeed: 62, handling: 60, stability: 60}},
    ],
  },
];

/**
 * Runs a deterministic seeded balancing pass on the League Bible §9 roster:
 * - Preserves each marble's distinct archetype (e.g. sprinters stay sprinters,
 *   anchors stay high-stability, Atlas stays balanced leader).
 * - Elevates severe under-rated 4th-marble outliers (Grumble, Moss, Bingo, Glitch, Rocket)
 *   into the 55-85 bell-curve target band so 3-marble and 4-marble team events stay competitive.
 * - Normalises every team's total attribute budget so team averages sit tightly around ~70.2 ± 0.6.
 */
export function runAttributeBalancingPass(seed: number): Record<string, MarbleAttributes> {
  const rng = createSeededRng(seed);
  const result: Record<string, MarbleAttributes> = {};

  // Step 1: Soft-clamp outliers & apply seeded micro-jitter (±1) while preserving archetypes
  const teamRaw: Array<{teamId: string; marbles: Array<{id: string; attrs: MarbleAttributes}>}> = [];

  for (const teamDef of APPROVED_ROSTER_DEFINITIONS) {
    const teamMarbles: Array<{id: string; attrs: MarbleAttributes}> = [];
    for (const m of teamDef.marbles) {
      const b = m.baseline;
      // Gently pull values below 56 upward and compress >91 slightly toward 90-92 ceiling
      const pullToBand = (v: number) => {
        let adjusted = v;
        if (v < 58) adjusted = Math.round(58 - (58 - v) * 0.45);
        if (v > 90) adjusted = Math.round(90 + (v - 90) * 0.5);
        // Tiny deterministic seed variation (-1, 0, +1)
        const jitter = Math.floor(rng() * 3) - 1;
        return Math.max(52, Math.min(92, adjusted + jitter));
      };

      const attrs: MarbleAttributes = {
        acceleration: pullToBand(b.acceleration),
        topSpeed: pullToBand(b.topSpeed),
        handling: pullToBand(b.handling),
        stability: pullToBand(b.stability),
      };
      teamMarbles.push({id: m.id, attrs});
    }

    // Ensure each team's lead sprinter (max ACC+SPD) has competitive Sprint parity (>=168)
    const leadSprinter = [...teamMarbles].sort(
      (a, b) =>
        b.attrs.acceleration + b.attrs.topSpeed - (a.attrs.acceleration + a.attrs.topSpeed),
    )[0];
    if (leadSprinter.attrs.acceleration + leadSprinter.attrs.topSpeed < 168) {
      leadSprinter.attrs.topSpeed = Math.min(92, leadSprinter.attrs.topSpeed + 3);
      leadSprinter.attrs.acceleration = Math.min(92, leadSprinter.attrs.acceleration + 2);
    }

    // Step 2: Balance team total attribute sum toward target 1124 (mean 70.25 per attribute)
    const targetTeamSum = 1124;
    const keys: Array<keyof MarbleAttributes> = ['acceleration', 'topSpeed', 'handling', 'stability'];
    let currentSum = teamMarbles.reduce(
      (acc, m) => acc + m.attrs.acceleration + m.attrs.topSpeed + m.attrs.handling + m.attrs.stability,
      0,
    );

    let guard = 0;
    while (Math.abs(currentSum - targetTeamSum) > 4 && guard < 40) {
      guard++;
      const delta = currentSum < targetTeamSum ? 1 : -1;
      // Apply adjustments to the 4th marble or non-peak attributes so star identities remain intact
      const candidateMarble =
        delta > 0
          ? [...teamMarbles].sort(
              (a, b) =>
                a.attrs.acceleration +
                a.attrs.topSpeed +
                a.attrs.handling +
                a.attrs.stability -
                (b.attrs.acceleration + b.attrs.topSpeed + b.attrs.handling + b.attrs.stability),
            )[0]
          : [...teamMarbles].sort(
              (a, b) =>
                b.attrs.acceleration +
                b.attrs.topSpeed +
                b.attrs.handling +
                b.attrs.stability -
                (a.attrs.acceleration + a.attrs.topSpeed + a.attrs.handling + a.attrs.stability),
            )[0];
      const key = keys[Math.floor(rng() * keys.length)];
      const nextVal = candidateMarble.attrs[key] + delta;
      if (nextVal >= 52 && nextVal <= 92) {
        candidateMarble.attrs[key] = nextVal;
        currentSum += delta;
      }
    }

    teamRaw.push({teamId: teamDef.id, marbles: teamMarbles});
  }

  for (const t of teamRaw) {
    for (const m of t.marbles) {
      result[m.id] = m.attrs;
    }
  }

  return result;
}

function emptyDisciplineRecord(): DisciplineRecord {
  return {
    appearances: 0,
    wins: 0,
    podiums: 0,
    bestFinish: null,
    bestTimeSeconds: null,
    totalFinishPosition: 0,
  };
}

export function createEmptyMarbleStats(): MarbleStats {
  return {
    appearances: 0,
    wins: 0,
    podiums: 0,
    totalFinishPosition: 0,
    bestFinish: null,
    personalBestTimeSeconds: null,
    byDiscipline: {
      Sprint: emptyDisciplineRecord(),
      Circuit: emptyDisciplineRecord(),
      Obstacle: emptyDisciplineRecord(),
      'Classic Run': emptyDisciplineRecord(),
    },
    achievements: [],
  };
}

export function createInitialVenues(): Record<string, Venue> {
  return {
    venue_velocity_park: {
      id: 'venue_velocity_park',
      name: 'Velocity Park',
      discipline: 'Sprint',
      theme: 'daylight-arena',
      characteristics:
        '80-metre eight-lane straightaway with an acute 12-degree launch ramp and calibrated polycarbonate dividers.',
      sprintConfig: {
        trackLengthMeters: 80,
        rampLengthMeters: 12,
        rampSlopeDegrees: 12.5,
        mainSlopeDegrees: 2.1,
        laneWidthMeters: 0.92,
        surfaceRoughness: 0.45,
        seamCount: 9,
      },
      trackRecord: null,
      historicalEventIds: [],
      notableIncidents: [],
    },
    venue_stratos_straight: {
      id: 'venue_stratos_straight',
      name: 'Stratos Straightaway',
      discipline: 'Sprint',
      theme: 'twilight-floodlit',
      characteristics:
        '100-metre floodlit high-speed sprint corridor featuring a steeper 14.5-degree drop chute and brisk surface seams.',
      sprintConfig: {
        trackLengthMeters: 100,
        rampLengthMeters: 14,
        rampSlopeDegrees: 14.5,
        mainSlopeDegrees: 2.4,
        laneWidthMeters: 0.92,
        surfaceRoughness: 0.65,
        seamCount: 12,
      },
      trackRecord: null,
      historicalEventIds: [],
      notableIncidents: [],
    },
    venue_apex_raceway: {
      id: 'venue_apex_raceway',
      name: 'Apex Raceway',
      discipline: 'Circuit',
      theme: 'daylight-arena',
      characteristics: 'Multi-lap banked circuit built for high-speed cornering and draft overtakes.',
      trackRecord: null,
      historicalEventIds: [],
      notableIncidents: [],
    },
    venue_cobalt_ring: {
      id: 'venue_cobalt_ring',
      name: 'Cobalt Ring',
      discipline: 'Circuit',
      theme: 'twilight-floodlit',
      characteristics: 'Technical double-hairpin circuit with elevated sweeping carousel bends.',
      trackRecord: null,
      historicalEventIds: [],
      notableIncidents: [],
    },
    venue_chaos_bowl: {
      id: 'venue_chaos_bowl',
      name: 'The Chaos Bowl',
      discipline: 'Obstacle',
      theme: 'coastal-bowl',
      characteristics: 'Full-field 32-marble arena featuring funnels, bumpers, and split-gate deflectors.',
      trackRecord: null,
      historicalEventIds: [],
      notableIncidents: [],
    },
    venue_pendulum_quarry: {
      id: 'venue_pendulum_quarry',
      name: 'Pendulum Quarry',
      discipline: 'Obstacle',
      theme: 'twilight-floodlit',
      characteristics: 'Cascading quarry descent with rotating platforms and staggered chicanes.',
      trackRecord: null,
      historicalEventIds: [],
      notableIncidents: [],
    },
    venue_gravity_ridge: {
      id: 'venue_gravity_ridge',
      name: 'Gravity Ridge',
      discipline: 'Classic Run',
      theme: 'alpine-ridge',
      characteristics: 'Long-distance point-to-point alpine run with tunnels and elevation drops.',
      trackRecord: null,
      historicalEventIds: [],
      notableIncidents: [],
    },
    venue_solstice_pass: {
      id: 'venue_solstice_pass',
      name: 'Solstice Pass',
      discipline: 'Classic Run',
      theme: 'coastal-bowl',
      characteristics: 'Endurance coastal canyon point-to-point course with sweeping S-curves.',
      trackRecord: null,
      historicalEventIds: [],
      notableIncidents: [],
    },
  };
}

export function createSeasonCalendar(): CalendarRound[] {
  const schedule: Array<{round: number; discipline: Discipline; venueId: string; perTeam: number}> = [
    {round: 1, discipline: 'Sprint', venueId: 'venue_velocity_park', perTeam: 1},
    {round: 2, discipline: 'Circuit', venueId: 'venue_apex_raceway', perTeam: 2},
    {round: 3, discipline: 'Obstacle', venueId: 'venue_chaos_bowl', perTeam: 4},
    {round: 4, discipline: 'Classic Run', venueId: 'venue_gravity_ridge', perTeam: 3},
    {round: 5, discipline: 'Sprint', venueId: 'venue_stratos_straight', perTeam: 1},
    {round: 6, discipline: 'Circuit', venueId: 'venue_cobalt_ring', perTeam: 2},
    {round: 7, discipline: 'Obstacle', venueId: 'venue_pendulum_quarry', perTeam: 4},
    {round: 8, discipline: 'Classic Run', venueId: 'venue_solstice_pass', perTeam: 3},
  ];

  return schedule.map((item) => ({
    roundNumber: item.round,
    discipline: item.discipline,
    venueId: item.venueId,
    marblesPerTeam: item.perTeam,
    playableInCurrentMilestone: item.discipline === 'Sprint',
    status: 'scheduled',
    result: null,
  }));
}

export function createInitialLeagueState(seed: number = DEFAULT_LEAGUE_SEED): LeagueState {
  const balancedAttrs = runAttributeBalancingPass(seed);
  const teams: Record<string, Team> = {};
  const teamOrder: string[] = [];
  const marbles: Record<string, Marble> = {};
  const marbleOrder: string[] = [];

  APPROVED_ROSTER_DEFINITIONS.forEach((teamDef, tIdx) => {
    teamOrder.push(teamDef.id);
    const marbleIds: string[] = [];
    teamDef.marbles.forEach((mDef, mIdx) => {
      marbleIds.push(mDef.id);
      marbleOrder.push(mDef.id);
      marbles[mDef.id] = {
        id: mDef.id,
        name: mDef.name,
        teamId: teamDef.id,
        attributes: balancedAttrs[mDef.id],
        stats: createEmptyMarbleStats(),
        reputations: [],
        visualSeed: (tIdx + 1) * 100 + (mIdx + 1) * 17,
      };
    });

    teams[teamDef.id] = {
      id: teamDef.id,
      name: teamDef.name,
      shortCode: teamDef.shortCode,
      primaryColor: teamDef.primaryColor,
      secondaryColor: teamDef.secondaryColor,
      accentColor: teamDef.accentColor,
      identity: teamDef.identity,
      emblemType: teamDef.emblemType,
      marbleIds,
      stats: {
        eventsCompeted: 0,
        eventWins: 0,
        eventSeconds: 0,
        eventThirds: 0,
        podiums: 0,
        totalChampionshipPoints: 0,
        championshipsWon: 0,
      },
    };
  });

  return {
    version: 1,
    leagueSeed: seed,
    currentSeasonNumber: 1,
    teams,
    teamOrder,
    marbles,
    marbleOrder,
    venues: createInitialVenues(),
    calendar: createSeasonCalendar(),
    seasonHistory: [],
  };
}
