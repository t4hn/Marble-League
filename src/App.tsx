import React from 'react';
import {Play} from 'lucide-react';
import {LeagueState, RaceEventResult} from './types/league';
import {
  commitRaceResultToLeague,
  loadLeagueState,
  renameMarbleDisplayName,
  renameTeamDisplayName,
  resetLeagueState,
} from './engine/storage';
import {HubSection, LeagueHubView} from './components/LeagueHubView';
import {TeamsView} from './components/TeamsView';
import {MarblesView} from './components/MarblesView';
import {CalendarView} from './components/CalendarView';
import {StandingsView} from './components/StandingsView';
import {SprintBroadcastView} from './components/SprintBroadcastView';

export default function App() {
  const [league, setLeague] = React.useState<LeagueState>(() => loadLeagueState());
  const [section, setSection] = React.useState<HubSection>('hub');
  const [selectedTeamId, setSelectedTeamId] = React.useState<string | null>(null);
  const [selectedMarbleId, setSelectedMarbleId] = React.useState<string | null>(null);
  const [activeBroadcastRound, setActiveBroadcastRound] = React.useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        return 1;
      }
    }
    return null;
  });

  React.useEffect(() => {
    if (activeBroadcastRound === null) {
      document.body.dataset.state = 'hub';
    }
  }, [activeBroadcastRound]);

  const nextPlayableRound =
    league.calendar.find((r) => r.status === 'scheduled' && r.playableInCurrentMilestone) ??
    league.calendar.find((r) => r.playableInCurrentMilestone) ??
    league.calendar[0];

  const handleCommitResult = React.useCallback((result: RaceEventResult) => {
    setLeague((prev) => commitRaceResultToLeague(prev, result));
  }, []);

  const handleRenameTeam = React.useCallback((teamId: string, newName: string) => {
    setLeague((prev) => renameTeamDisplayName(prev, teamId, newName));
  }, []);

  const handleRenameMarble = React.useCallback((marbleId: string, newName: string) => {
    setLeague((prev) => renameMarbleDisplayName(prev, marbleId, newName));
  }, []);

  const handleResetLeague = React.useCallback(() => {
    const fresh = resetLeagueState();
    setLeague(fresh);
    setSelectedTeamId(null);
    setSelectedMarbleId(null);
  }, []);

  // Full-bleed 3D Sprint Broadcast mode
  if (activeBroadcastRound !== null) {
    const round = league.calendar.find((r) => r.roundNumber === activeBroadcastRound);
    if (round && round.playableInCurrentMilestone) {
      return (
        <SprintBroadcastView
          league={league}
          round={round}
          onCommitResult={handleCommitResult}
          onExit={(goTo) => {
            setActiveBroadcastRound(null);
            if (goTo) setSection(goTo);
          }}
        />
      );
    }
  }

  const navItems: Array<{id: HubSection; label: string}> = [
    {id: 'hub', label: 'League Hub'},
    {id: 'teams', label: 'Teams'},
    {id: 'marbles', label: 'Marbles'},
    {id: 'calendar', label: 'Calendar'},
    {id: 'standings', label: 'Standings'},
  ];

  return (
    <div className="min-h-screen bg-[#0b0e14] text-[#f1f5f9] flex flex-col">
      {/* Clean 3-Zone Top Navigation Bar */}
      <header className="border-b border-white/10 bg-[#0f141e]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setSection('hub')}
            className="font-display text-2xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            MARBLE LEAGUE
          </button>

          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  section === item.id
                    ? 'text-white border-[#e5a93c]'
                    : 'text-slate-400 border-transparent hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setActiveBroadcastRound(nextPlayableRound.roundNumber)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#e5a93c] text-[#0b0e14] text-xs font-bold hover:bg-[#f0b954] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Watch Sprint R{nextPlayableRound.roundNumber}
            </button>
          </div>
        </div>

        {/* Mobile navigation strip */}
        <nav
          aria-label="Mobile navigation"
          className="md:hidden flex items-center gap-4 px-4 pb-3 overflow-x-auto"
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`text-xs font-medium whitespace-nowrap shrink-0 pb-1 border-b-2 ${
                section === item.id
                  ? 'text-white border-[#e5a93c]'
                  : 'text-slate-400 border-transparent'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {section === 'hub' && (
          <LeagueHubView
            league={league}
            onNavigate={(s) => setSection(s)}
            onWatchRound={(rnd) => setActiveBroadcastRound(rnd)}
            onInspectTeam={(teamId) => {
              setSelectedTeamId(teamId);
              setSection('teams');
            }}
            onInspectMarble={(marbleId) => {
              setSelectedMarbleId(marbleId);
              setSection('marbles');
            }}
          />
        )}

        {section === 'teams' && (
          <TeamsView
            league={league}
            selectedTeamId={selectedTeamId}
            onSelectTeam={setSelectedTeamId}
            onInspectMarble={(marbleId) => {
              setSelectedMarbleId(marbleId);
              setSection('marbles');
            }}
            onRenameTeam={handleRenameTeam}
          />
        )}

        {section === 'marbles' && (
          <MarblesView
            league={league}
            selectedMarbleId={selectedMarbleId}
            onSelectMarble={setSelectedMarbleId}
            onRenameMarble={handleRenameMarble}
          />
        )}

        {section === 'calendar' && (
          <CalendarView
            league={league}
            onWatchRound={(rnd) => setActiveBroadcastRound(rnd)}
            onResetSeason={handleResetLeague}
          />
        )}

        {section === 'standings' && (
          <StandingsView
            league={league}
            onInspectTeam={(teamId) => {
              setSelectedTeamId(teamId);
              setSection('teams');
            }}
          />
        )}
      </main>
    </div>
  );
}
