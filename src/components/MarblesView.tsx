import React from 'react';
import {Search, Pencil, Check, X} from 'lucide-react';
import {Discipline, LeagueState, Marble} from '../types/league';
import {MarbleAvatar, TeamEmblem} from './MarbleAvatar';

interface MarblesViewProps {
  league: LeagueState;
  selectedMarbleId: string | null;
  onSelectMarble: (marbleId: string | null) => void;
  onRenameMarble: (marbleId: string, newName: string) => void;
}

const DISCIPLINES: Discipline[] = ['Sprint', 'Circuit', 'Obstacle', 'Classic Run'];

export const MarblesView: React.FC<MarblesViewProps> = ({
  league,
  selectedMarbleId,
  onSelectMarble,
  onRenameMarble,
}) => {
  const [query, setQuery] = React.useState('');
  const [teamFilter, setTeamFilter] = React.useState<string>('all');
  const [sortBy, setSortBy] = React.useState<'name' | 'acc' | 'spd' | 'hnd' | 'stb' | 'wins'>('name');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState('');

  const filteredMarbles = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = league.marbleOrder
      .map((id) => league.marbles[id])
      .filter((m): m is Marble => {
        if (!m) return false;
        if (teamFilter !== 'all' && m.teamId !== teamFilter) return false;
        if (!q) return true;
        const team = league.teams[m.teamId];
        return (
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          (team?.name.toLowerCase().includes(q) ?? false)
        );
      });

    list.sort((a, b) => {
      switch (sortBy) {
        case 'acc':
          return b.attributes.acceleration - a.attributes.acceleration;
        case 'spd':
          return b.attributes.topSpeed - a.attributes.topSpeed;
        case 'hnd':
          return b.attributes.handling - a.attributes.handling;
        case 'stb':
          return b.attributes.stability - a.attributes.stability;
        case 'wins':
          return b.stats.wins - a.stats.wins || b.stats.podiums - a.stats.podiums;
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return list;
  }, [league.marbleOrder, league.marbles, league.teams, query, teamFilter, sortBy]);

  const activeMarble = selectedMarbleId ? league.marbles[selectedMarbleId] : null;
  const activeTeam = activeMarble ? league.teams[activeMarble.teamId] : null;

  const beginEdit = (m: Marble) => {
    setEditingId(m.id);
    setDraftName(m.name);
  };

  const commitEdit = (id: string) => {
    if (draftName.trim()) {
      onRenameMarble(id, draftName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            Marble Directory
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            All 32 approved competitors with permanent IDs, four physical attributes, and career records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              aria-label="Search marbles by name, team, or ID"
              placeholder="Search competitor or ID..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 pr-3 py-2 rounded-lg bg-[#121722] border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#e5a93c] w-56"
            />
          </div>

          <select
            aria-label="Filter marbles by team"
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#121722] border border-white/15 text-sm text-white focus:outline-none focus:border-[#e5a93c]"
          >
            <option value="all">All 8 Teams</option>
            {league.teamOrder.map((tId) => (
              <option key={tId} value={tId}>
                {league.teams[tId].name}
              </option>
            ))}
          </select>

          <select
            aria-label="Sort marbles"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-2 rounded-lg bg-[#121722] border border-white/15 text-sm text-white focus:outline-none focus:border-[#e5a93c]"
          >
            <option value="name">Sort: Name</option>
            <option value="acc">Sort: Acceleration</option>
            <option value="spd">Sort: Top Speed</option>
            <option value="hnd">Sort: Handling</option>
            <option value="stb">Sort: Stability</option>
            <option value="wins">Sort: Career Wins</option>
          </select>
        </div>
      </div>

      {/* Selected Marble Profile Panel */}
      {activeMarble && activeTeam && (
        <section className="bg-[#121722] border border-[#e5a93c]/60 rounded-xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <MarbleAvatar
                primaryColor={activeTeam.primaryColor}
                secondaryColor={activeTeam.secondaryColor}
                accentColor={activeTeam.accentColor}
                size={52}
              />
              <div>
                {editingId === activeMarble.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      aria-label={`Edit display name for ${activeMarble.name}`}
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit(activeMarble.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="bg-[#0b0e14] border border-white/25 rounded px-2.5 py-1 text-lg font-bold text-white focus:outline-none focus:border-[#e5a93c]"
                      autoFocus
                    />
                    <button
                      type="button"
                      aria-label={`Save name for ${activeMarble.name}`}
                      onClick={() => commitEdit(activeMarble.id)}
                      className="p-1.5 rounded bg-[#e5a93c] text-[#0b0e14] cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Cancel marble rename"
                      onClick={() => setEditingId(null)}
                      className="p-1.5 rounded bg-white/10 text-slate-300 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-3xl font-bold text-white">
                      {activeMarble.name}
                    </h2>
                    <button
                      type="button"
                      aria-label={`Rename ${activeMarble.name}`}
                      onClick={() => beginEdit(activeMarble)}
                      className="p-1 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                  <span className="text-slate-200 font-medium">{activeTeam.name}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">Permanent ID: {activeMarble.id}</span>
                  {activeMarble.reputations.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#e5a93c] font-medium">
                        {activeMarble.reputations.join(' / ')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelectMarble(null)}
              className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-xs font-medium text-slate-200 cursor-pointer"
            >
              Close Profile
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Attributes */}
            <div className="lg:col-span-5 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Physical Attributes (Fixed Season 1)
              </h3>
              {(
                [
                  ['Acceleration', activeMarble.attributes.acceleration],
                  ['Top Speed', activeMarble.attributes.topSpeed],
                  ['Handling', activeMarble.attributes.handling],
                  ['Stability', activeMarble.attributes.stability],
                ] as const
              ).map(([label, val]) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">{label}</span>
                    <span className="font-mono font-semibold text-white tabular-nums">{val} / 100</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#0b0e14] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${val}%`,
                        backgroundColor: activeTeam.primaryColor,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Career & Discipline Breakdown */}
            <div className="lg:col-span-7 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-[#0b0e14] border border-white/8">
                  <div className="text-xs text-slate-400">Starts</div>
                  <div className="font-mono text-xl font-bold text-white tabular-nums mt-0.5">
                    {activeMarble.stats.appearances}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#0b0e14] border border-white/8">
                  <div className="text-xs text-slate-400">Wins / Podiums</div>
                  <div className="font-mono text-xl font-bold text-white tabular-nums mt-0.5">
                    {activeMarble.stats.wins} / {activeMarble.stats.podiums}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#0b0e14] border border-white/8">
                  <div className="text-xs text-slate-400">Avg Finish</div>
                  <div className="font-mono text-xl font-bold text-white tabular-nums mt-0.5">
                    {activeMarble.stats.appearances > 0
                      ? (activeMarble.stats.totalFinishPosition / activeMarble.stats.appearances).toFixed(2)
                      : '—'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#0b0e14] border border-white/8">
                  <div className="text-xs text-slate-400">Personal Best</div>
                  <div className="font-mono text-xl font-bold text-[#e5a93c] tabular-nums mt-0.5">
                    {activeMarble.stats.personalBestTimeSeconds !== null
                      ? `${activeMarble.stats.personalBestTimeSeconds.toFixed(3)}s`
                      : '—'}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 uppercase">
                      <th className="py-2 pr-3 font-medium">Discipline</th>
                      <th className="py-2 px-2 font-medium text-right">Races</th>
                      <th className="py-2 px-2 font-medium text-right">Wins</th>
                      <th className="py-2 px-2 font-medium text-right">Best Pos</th>
                      <th className="py-2 pl-2 font-medium text-right">Best Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/6">
                    {DISCIPLINES.map((disc) => {
                      const rec = activeMarble.stats.byDiscipline[disc];
                      return (
                        <tr key={disc}>
                          <td className="py-2 pr-3 text-slate-200 font-medium">{disc}</td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-300">
                            {rec.appearances}
                          </td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-300">
                            {rec.wins}
                          </td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-300">
                            {rec.bestFinish ?? '—'}
                          </td>
                          <td className="py-2 pl-2 text-right font-mono tabular-nums text-slate-300">
                            {rec.bestTimeSeconds !== null ? `${rec.bestTimeSeconds.toFixed(3)}s` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {activeMarble.stats.achievements.length > 0 && (
                <div className="text-xs text-slate-300">
                  <span className="text-slate-400 font-semibold">Career Achievements: </span>
                  {activeMarble.stats.achievements.slice(0, 3).join(' · ')}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Full 32-Competitor Table */}
      <div className="bg-[#121722] border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400 bg-[#0f141e]">
                <th className="py-3.5 pl-5 pr-3 font-medium">Competitor</th>
                <th className="py-3.5 px-3 font-medium">Franchise</th>
                <th className="py-3.5 px-3 font-medium">Permanent ID</th>
                <th className="py-3.5 px-2 font-medium text-right">ACC</th>
                <th className="py-3.5 px-2 font-medium text-right">SPD</th>
                <th className="py-3.5 px-2 font-medium text-right">HND</th>
                <th className="py-3.5 px-2 font-medium text-right">STB</th>
                <th className="py-3.5 px-3 font-medium text-right">Starts</th>
                <th className="py-3.5 px-3 font-medium text-right">Wins</th>
                <th className="py-3.5 pl-3 pr-5 font-medium text-right">Best Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6 text-sm">
              {filteredMarbles.map((marble) => {
                const team = league.teams[marble.teamId];
                const isSelected = selectedMarbleId === marble.id;
                return (
                  <tr
                    key={marble.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-[#e5a93c]/10' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td className="py-3 pl-5 pr-3">
                      <button
                        type="button"
                        onClick={() => onSelectMarble(marble.id)}
                        className="flex items-center gap-3 text-left hover:text-[#e5a93c] transition-colors cursor-pointer"
                      >
                        <MarbleAvatar
                          primaryColor={team.primaryColor}
                          secondaryColor={team.secondaryColor}
                          accentColor={team.accentColor}
                          size={28}
                        />
                        <div>
                          <div className="font-semibold text-white">{marble.name}</div>
                          {marble.reputations.length > 0 && (
                            <div className="text-[11px] text-[#e5a93c]">
                              {marble.reputations[0]}
                            </div>
                          )}
                        </div>
                      </button>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2 text-slate-300">
                        <TeamEmblem team={team} size={20} />
                        <span className="whitespace-nowrap">{team.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-xs text-slate-400">
                      {marble.id}
                    </td>
                    <td className="py-3 px-2 text-right font-mono tabular-nums text-slate-200">
                      {marble.attributes.acceleration}
                    </td>
                    <td className="py-3 px-2 text-right font-mono tabular-nums text-slate-200">
                      {marble.attributes.topSpeed}
                    </td>
                    <td className="py-3 px-2 text-right font-mono tabular-nums text-slate-200">
                      {marble.attributes.handling}
                    </td>
                    <td className="py-3 px-2 text-right font-mono tabular-nums text-slate-200">
                      {marble.attributes.stability}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                      {marble.stats.appearances}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-white font-semibold">
                      {marble.stats.wins}
                    </td>
                    <td className="py-3 pl-3 pr-5 text-right font-mono tabular-nums text-slate-300">
                      {marble.stats.personalBestTimeSeconds !== null
                        ? `${marble.stats.personalBestTimeSeconds.toFixed(3)}s`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
