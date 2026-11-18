# MARBLE LEAGUE

## League Bible & Inaugural Season Specification

**Document status:** Working design specification\
**Version:** 0.1\
**Purpose:** Reference document for development in Google AI Studio

This document records the currently agreed Marble League concept, rules,
roster identities and initial design constraints. It is intended to be
supplied as project context alongside implementation prompts.

------------------------------------------------------------------------

# 1. Game Overview

**Marble League** is a spectator-first competitive sports simulation
built around a fictional professional league of marble racing teams.

The player observes competitions rather than directly controlling
marbles. The entertainment comes from physical races, collisions,
unexpected outcomes, team rivalries, individual competitors developing
reputations, and a persistent history of seasons.

The simulation should produce its own sporting stories through actual
race outcomes. Winners must not be predetermined or scripted.

## Core principles

-   Spectator-first: the player watches races unfold.
-   Physics-driven: physical simulation determines race outcomes.
-   Team championship: there is one league champion per season,
    determined by team results.
-   Persistent world: teams, marbles, records and league history carry
    between seasons.
-   Emergent narratives: reputations and rivalries develop from actual
    performances.
-   Manageable initial scope: build a reliable first version before
    adding management or career complexity.

## Visual direction

**Hybrid visual style:** - Convincing, realistic-looking glass
marbles. - Believable physical movement and collisions. - Stylised
stadiums, tracks, environments and broadcast graphics. - Distinct team
colours and visual identities. - Professional sports-broadcast
presentation.

------------------------------------------------------------------------

# 2. League Structure

  Item                                      Initial specification
  -------------------------------------- ------------------------
  Teams                                                         8
  Marbles per team                                              4
  Total marbles                                                32
  Disciplines                                                   4
  Rounds per season                                             8
  Championship types                       Team championship only
  Initial season attribute progression                       None

Each team has four active marbles. There are no substitutes in the first
version.

All 32 marbles have persistent individual identities, names,
appearances, team affiliations, physical attributes and career
statistics.

There is no separate individual marble championship. Individual
statistics are retained for historical and storytelling purposes.

------------------------------------------------------------------------

# 3. Competition Disciplines

Each discipline has a different number of marbles representing each
team.

  Discipline      Marbles per team   Total field Format
  ------------- ------------------ ------------- ---------------------------------------------------
  Sprint                         1             8 Short, straight-line race
  Circuit                        2            16 Multi-lap race with bends, banking and overtaking
  Obstacle                       4            32 Full-team chaotic obstacle race
  Classic Run                    3            24 Longer point-to-point race

## 3.1 Sprint

-   One representative from each team.
-   Short, straight-line racing lanes.
-   Emphasis on acceleration and top speed.
-   Finishing position determines the individual result.

## 3.2 Circuit

-   Two representatives from each team.
-   Multi-lap course with bends, banking and overtaking opportunities.
-   Emphasis on handling, speed and consistency.
-   Finishing position determines each marble's individual result.

## 3.3 Obstacle

-   All four marbles from every team compete.
-   Full field of 32 marbles.
-   Course contains obstacles that introduce chaos and interfere with
    racing.
-   Possible hazards include moving gates, swinging arms, bumpers,
    deflectors, funnels, narrow passages, rotating platforms, ramps,
    drops and jumps.
-   No checkpoint penalties or complicated obstacle scoring.
-   The race result is determined by finishing position. The first
    marble across the finish line wins.

The obstacle course should be entertaining and unpredictable, but remain
a race rather than a checkpoint-management challenge.

## 3.4 Classic Run

-   Three representatives from each team.
-   Longer point-to-point race.
-   Can include winding sections, elevation changes, sweeping turns and
    tunnels.
-   Emphasis on overall performance over a longer distance.
-   Finishing position determines the individual result.

------------------------------------------------------------------------

# 4. Season Calendar

The inaugural format uses a fixed eight-round calendar. Each discipline
appears twice.

    Round Discipline
  ------- -------------
        1 Sprint
        2 Circuit
        3 Obstacle
        4 Classic Run
        5 Sprint
        6 Circuit
        7 Obstacle
        8 Classic Run

The second appearance of each discipline should use a different track
layout or configuration.

The calendar remains fixed for the initial version. Randomised season
scheduling may be considered in a later version.

## Season completion

At the end of Round 8:

1.  Finalise event and championship standings.
2.  Declare the team champion.
3.  Archive the season's results.
4.  Update team and individual career statistics.
5.  Record notable performances and records.
6.  Carry teams and marbles into the next season.

The league is persistent. Starting a new season must not erase previous
seasons or career histories.

## Championship tie-breakers

If teams finish level on Championship points:

1.  Most event victories.
2.  Most second-place event finishes.
3.  Most third-place event finishes.
4.  If still tied, share the championship.

------------------------------------------------------------------------

# 5. Championship Scoring

The league uses a two-stage scoring system so that every discipline has
equal importance, even though the number of marbles competing varies.

## Stage 1: Calculate team event performance

1.  Record each competing marble's finishing position.
2.  Convert individual finishing positions into a standardised
    performance score relative to that event's field size.
3.  Average the standardised scores of the marbles representing each
    team.
4.  Rank the eight teams by their resulting event performance.

This normalisation is essential. Sprint has one marble per team, while
Obstacle has four. Raw sums of individual points must not be used
because they would give larger fields an unfair scoring advantage.

The exact mathematical normalisation formula should be implemented
consistently and tested across all four field sizes. It must preserve
the principle that a team's event result reflects the average
performance of its representatives.

## Stage 2: Award Championship points

Once the eight teams are ranked for the event, award Championship
points:

    Team event position   Championship points
  --------------------- ---------------------
                    1st                    15
                    2nd                    12
                    3rd                    10
                    4th                     8
                    5th                     6
                    6th                     4
                    7th                     2
                    8th                     1

Every discipline has equal Championship weighting. The maximum available
score is 15 points per event, regardless of the number of marbles
competing.

## Individual statistics

Individual marble statistics are tracked separately from team
Championship points.

Track at least: - Race appearances. - Individual race victories. -
Podium finishes. - Average finishing position. - Discipline-specific
results. - Personal bests. - Track records where applicable. - Notable
career achievements.

There is no individual Championship table or individual title in the
initial design.

------------------------------------------------------------------------

# 6. Track and Venue System

## Hybrid track generation

Use a hybrid approach combining dedicated discipline templates with
reusable modular components and procedural variation.

The development sequence should be:

1.  Build one reliable dedicated track for each discipline.
2.  Validate marble physics, collision behaviour and race completion.
3.  Create reusable track components.
4.  Add controlled procedural variations within each discipline's design
    constraints.
5.  Expand the component library over time.

Do not prioritise large quantities of procedural content before the
underlying physics and track reliability are proven.

## Discipline-specific generation

### Sprint

A dedicated straight-track template. Variation may include track length,
surface characteristics and lane details.

### Circuit

A dedicated circuit structure with controlled variation in corner
shapes, banking, straights and proportions.

### Obstacle

The greatest procedural variation. Assemble hazards from a library of
modular obstacles, while ensuring the generated course remains
physically valid and raceable.

### Classic Run

A point-to-point template assembled from predefined sections. Vary
elevation changes, turns, tunnels and track sections.

## Persistent venue identity

Tracks should be named venues, not disposable random layouts.

Each venue should have: - Persistent venue ID. - Venue name. -
Discipline. - Visual theme and environment. - Recognisable track
characteristics. - Track configuration or generated layout data. - Track
records and fastest performances. - Historical event results. - Notable
incidents and memorable races.

Procedural variations can occur at a venue while retaining its identity.
The system should preserve enough layout metadata to make historical
records meaningful and comparable.

## Illustrative venue names

These are examples only, not final locked venue names: - Velocity Park
--- Sprint. - Apex Raceway --- Circuit. - The Chaos Bowl --- Obstacle. -
Gravity Ridge --- Classic Run.

------------------------------------------------------------------------

# 7. Marble Attributes and Physics

Each marble has four physical attributes, scored from 1 to 100.

  -----------------------------------------------------------------------
  Attribute                           Meaning
  ----------------------------------- -----------------------------------
  Acceleration                        How quickly the marble builds
                                      speed, including after slowing down

  Top Speed                           Maximum achievable velocity

  Handling                            Ability to navigate turns and
                                      changes in direction while
                                      retaining control

  Stability                           Resistance to disruption from
                                      collisions and obstacles
  -----------------------------------------------------------------------

## Initial attribute generation

The agreed generation approach is **moderate variation**.

Initial targets: - Population average around 70 for each attribute. -
Most values should fall approximately between 55 and 85. - Possible
range approximately 45 to 95. - Use a bell-curve-style distribution
rather than uniform random generation. - Generate meaningful strengths
and weaknesses without creating guaranteed winners. - Avoid making all
four attributes independent in a way that produces implausible or
excessively extreme profiles.

These are generation targets, not a requirement that every team or every
marble has identical ratings.

## Physical simulation principles

-   Race outcomes must be driven by physical simulation.
-   Attributes influence physical behaviour; they do not directly award
    finishing positions.
-   No scripted winners or predetermined race results.
-   No hidden luck attribute.
-   Momentum is a physical outcome of mass and velocity, not a marble
    attribute.
-   All marbles initially use the same physical dimensions and mass to
    keep the first version manageable.
-   Acceleration modifies acceleration response.
-   Top Speed sets a velocity ceiling.
-   Handling influences cornering control and energy loss.
-   Stability influences how strongly collisions and impacts disrupt
    trajectory.

The physics model should be tuned and tested so attributes matter
without overpowering the physical simulation.

## Attribute progression

Attributes are fixed for the entire first season.

There is no training, ageing, injury-related attribute change, recovery
or progression system in the first season.

The data model should leave room for future development systems, but
these should not be implemented yet.

------------------------------------------------------------------------

# 8. Marble Identity and Career History

Every marble should have a permanent unique ID that does not depend on
its display name.

Each marble stores: - Unique ID. - Display name. - Visual appearance. -
Team affiliation. - Four physical attributes. - Career statistics. -
Discipline-specific statistics. - Personal bests and records. -
Historical achievements. - Reputation or descriptive tags derived from
actual performances.

Changing a marble's display name later must not erase or reset its
history.

## Emergent reputations

Marbles may develop sporting reputations based on their real simulation
history. Examples include: - The Speedster. - The Survivor. - The
Closer. - The Underdog. - The Wrecking Ball. - The Choker. - The
Consistent One.

These are earned descriptions, not fixed classes or attribute buffs.
Reputation should be derived from recorded performances and can evolve
over time.

------------------------------------------------------------------------

# 9. Teams and Inaugural Roster

The eight franchise names and identities below are approved and locked
as the initial roster. Names may be edited later without losing
historical data.

Team identity includes: - Permanent team ID. - Display name. - Primary
and secondary colours. - Visual identity or emblem. - Four active
marbles. - Team career statistics and season history.

## 9.1 Velocity Vipers

**Colours:** Emerald / Black\
**Identity:** Fast, aggressive and technically sharp. The pace-setters.

  Marble     ACC   SPD   HND   STB
  -------- ----- ----- ----- -----
  Vex         88    84    62    58
  Nitro       63    66    88    76
  Venom       61    64    72    90
  Dash        68    66    66    64

## 9.2 Midnight Meteors

**Colours:** Navy / Silver\
**Identity:** Cool, composed and consistent. The professionals.

  Marble     ACC   SPD   HND   STB
  -------- ----- ----- ----- -----
  Orion       84    88    58    62
  Nova        66    62    84    80
  Comet       64    60    76    88
  Cosmo       66    74    70    58

## 9.3 Rumble Rams

**Colours:** Orange / Charcoal\
**Identity:** Physical competitors who thrive in traffic and collisions.
The wrecking crew.

  Marble      ACC   SPD   HND   STB
  --------- ----- ----- ----- -----
  Boulder      62    60    72    94
  Riot         86    78    66    58
  Bruiser      64    66    84    78
  Crash        68    76    58    70

## 9.4 Static Storm

**Colours:** Purple / White\
**Identity:** Unpredictable, occasionally brilliant and difficult to
read. The chaos merchants.

  Marble      ACC   SPD   HND   STB
  --------- ----- ----- ----- -----
  Voltage      90    82    60    56
  Flicker      64    70    90    64
  Surge        62    64    70    90
  Glitch       64    64    60    70

## 9.5 Crimson Comets

**Colours:** Crimson / Black\
**Identity:** High-performance specialists with a reputation for
spectacular finishes. The show-offs.

  Marble     ACC   SPD   HND   STB
  -------- ----- ----- ----- -----
  Blaze       86    90    58    58
  Flare       60    64    90    78
  Ember       64    62    74    90
  Rocket      70    64    58    66

## 9.6 Turbo Turtles

**Colours:** Teal / White\
**Identity:** A slightly ironic name for a team that values consistency
over flashy performances. The slow burners.

  Marble     ACC   SPD   HND   STB
  -------- ----- ----- ----- -----
  Shelby      62    62    88    86
  Turbo       84    86    64    60
  Tuck        66    64    76    82
  Moss        68    68    52    52

## 9.7 Golden Grizzlies

**Colours:** Gold / Black\
**Identity:** Strong all-round competitors with a no-nonsense
reputation. The contenders.

  Marble      ACC   SPD   HND   STB
  --------- ----- ----- ----- -----
  Atlas        72    72    84    84
  Kodiak       84    80    64    60
  Midas        64    68    82    78
  Grumble      60    60    50    58

## 9.8 Apex Antics

**Colours:** Electric Blue / White\
**Identity:** Unconventional competitors with flashes of brilliance and
occasional spectacular disasters. The wildcards.

  Marble     ACC   SPD   HND   STB
  -------- ----- ----- ----- -----
  Jinx        90    86    58    54
  Pogo        66    64    90    74
  Chaos       60    68    72    92
  Bingo       64    62    60    60

## Roster data status

The eight team names, colour identities and 32 marble names are
approved.

The attribute profiles above are illustrative first-pass profiles from
the roster discussion. Before implementation, run a balancing pass to: -
Confirm moderate variation across all 32 marbles. - Check team-average
attribute balance. - Avoid accidental overpowered or underpowered
franchises. - Preserve distinct individual strengths and weaknesses. -
Keep attribute generation reproducible from a stored seed.

Do not silently alter approved team or marble names during attribute
balancing.

------------------------------------------------------------------------

# 10. Team Selection for Events

For the first version, event selection is automatic.

  -----------------------------------------------------------------------
  Discipline                          Selection
  ----------------------------------- -----------------------------------
  Sprint                              One representative, selected for
                                      acceleration and top-speed
                                      suitability

  Circuit                             Two representatives, selected for
                                      speed and handling suitability

  Obstacle                            All four marbles

  Classic Run                         Three representatives, selected for
                                      balanced overall performance
  -----------------------------------------------------------------------

The selection system should be transparent and deterministic based on
the marble attributes for the initial version. It should not use hidden
random selection.

Future versions may introduce player-controlled selection or management,
but that is outside the initial scope.

------------------------------------------------------------------------

# 11. Broadcast and Spectator Experience

The game should feel like a televised sporting competition.

Core presentation elements: - Pre-race team introductions. - Starting
grid and competitor names. - Live leaderboard. - Race camera views that
keep the action readable. - Commentary reacting to actual simulation
events. - Finish-line results. - Team event rankings. - Championship
points awarded. - Updated season standings. - Historical records and
notable performances.

Commentary must be grounded in real race events and state. It should not
invent overtakes, collisions, rivalries or outcomes that did not occur.

Useful spectator controls: - Pause and resume. - Adjustable simulation
speed. - Replay or race recap where practical. - Clear final results and
standings.

------------------------------------------------------------------------

# 12. Future Features --- Explicitly Out of Initial Scope

The architecture may allow for these features later, but they should not
be built into the first playable version:

-   Substitute marbles and expanded rosters.
-   Injuries and recovery.
-   Ageing and retirement.
-   Training and attribute progression.
-   New marble recruitment.
-   Player-controlled team management.
-   Additional sporting disciplines.
-   More complex team rivalries and historical narrative systems.
-   Randomised season calendars.
-   More elaborate venue and procedural-generation systems.

The first priority is a reliable, entertaining league simulation with
persistent results.

------------------------------------------------------------------------

# 13. Initial Development Priorities

Recommended implementation order:

1.  Establish persistent data models for teams, marbles, venues, events,
    seasons and results.
2.  Create the eight teams and 32 named marbles.
3.  Implement and test attribute generation and team balance.
4.  Build reliable physical marble movement and collision behaviour.
5.  Build one dedicated track for each discipline.
6.  Implement event participation formats.
7.  Implement standardised team event scoring and Championship points.
8.  Build the fixed eight-round season lifecycle.
9.  Persist results, records and career statistics.
10. Add broadcast presentation, commentary and spectator controls.
11. Add modular track components and controlled procedural variations.

Do not attempt to implement every future feature at once. Validate the
core simulation and scoring before expanding.

------------------------------------------------------------------------

# 14. Decisions Register

  Decision                                           Status
  -------------------------------------------------- ----------------------------
  Spectator-first simulation                         Locked
  Hybrid realistic marbles / stylised presentation   Locked
  Eight teams                                        Locked
  Four active marbles per team                       Locked
  No substitutes in first version                    Locked
  Four initial disciplines                           Locked
  Sprint: one marble per team                        Locked
  Circuit: two marbles per team                      Locked
  Obstacle: all four marbles per team                Locked
  Classic Run: three marbles per team                Locked
  Eight fixed rounds per season                      Locked
  Each discipline appears twice per season           Locked
  Team Championship only                             Locked
  Standardised team event scoring                    Locked
  Championship points: 15, 12, 10, 8, 6, 4, 2, 1     Locked
  Persistent seasons and league history              Locked
  Hybrid track generation                            Locked
  Named venues with persistent identities            Locked
  Four physical marble attributes                    Locked
  Moderate initial attribute variation               Locked
  Marble attributes fixed during Season 1            Locked
  Team names, colours and 32 marble names            Approved
  Initial attribute profiles                         Require balancing pass
  Exact normalisation formula                        To be specified and tested
  Exact physics coefficients and tuning              To be developed and tested

------------------------------------------------------------------------

**End of current design specification.**
