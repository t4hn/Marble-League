import React from 'react';
import {Pencil, Check, X} from 'lucide-react';
import {LeagueState} from '../types/league';
import {calculateSeasonStandings} from '../engine/scoring';
import {MarbleAvatar, TeamEmblem} from './MarbleAvatar';

interface TeamsViewProps {
  league: LeagueState;
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string | null) => void;
  onInspectMarble: (marbleId: string) => void;
  onRenameTeam: (teamId: string, newName: string) => void;
}

export const TeamsView: React.FC<TeamsViewProps> = ({
  league,
  selectedTeamId,
  onSelectTeam,
  onInspectMarble,
  onRenameTeam,
}) => {
  const standings = React.useMemo(
    () => calculateSeasonStandings(league.calendar, league.teamOrder),
    [league.calendar, league.teamOrder],
  );
  const standingByTeam = React.useMemo(
    () => new Map(standings.map((s) => [s.teamId, s])),
    [standings],
  );

  const [editingTeamId, setEditingTeamId] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState('');

  const beginEdit = (teamId: string, currentName: string) => {
    setEditingTeamId(teamId);
    setDraftName(currentName);
  };

  const commitEdit = (teamId: string) => {
    if (draftName.trim()) {
      onRenameTeam(teamId, draftName.trim());
    }
    setEditingTeamId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            League Franchises
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Eight approved teams with four active marbles each. Display names can be edited while permanent IDs remain unchanged.
          </p>
        </div>
        <div className="text-xs text-slate-400 tabular-nums">
          8 Teams · 32 Active Marbles
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {league.teamOrder.map((teamId) => {
          const team = league.teams[teamId];
          const standing = standingByTeam.get(teamId);
          const isSelected = selectedTeamId === teamId;
          const isEditing = editingTeamId === teamId;

          return (
            <article
              key={team.id}
              className={`bg-[#121722] rounded-xl p-6 border transition-colors ${
                isSelected ? 'border-[#e5a93c]' : 'border-white/10'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3.5 min-w-0">
                  <TeamEmblem team={team} size={42} />
                  <div className="min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          aria-label={`Edit display name for ${team.name}`}
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(team.id);
                            if (e.key === 'Escape') setEditingTeamId(null);
                          }}
                          className="bg-[#0b0e14] border border-white/25 rounded px-2.5 py-1 text-base font-semibold text-white focus:outline-none focus:border-[#e5a93c]"
                          autoFocus
                        />
                        <button
                          type="button"
                          aria-label={`Save name for ${team.name}`}
                          onClick={() => commitEdit(team.id)}
                          className="p-1.5 rounded bg-[#e5a93c] text-[#0b0e14] hover:bg-[#f0b954] cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Cancel team rename"
                          onClick={() => setEditingTeamId(null)}
                          className="p-1.5 rounded bg-white/10 text-slate-300 hover:bg-white/15 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-2xl font-bold text-white truncate">
                          {team.name}
                        </h2>
                        <button
                          type="button"
                          aria-label={`Rename ${team.name}`}
                          onClick={() => beginEdit(team.id, team.name)}
                          className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5">
                      <span className="font-mono">{team.shortCode}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">ID: {team.id}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-mono text-xl font-bold text-white tabular-nums">
                    {standing?.points ?? 0} pts
                  </div>
                  <div className="text-xs text-slate-400 tabular-nums">
                    Rank #{standing?.rank ?? '-'} · {team.stats.eventWins} Wins
                  </div>
                </div>
              </div>

              <p className="mt-3 text-sm text-slate-300 leading-relaxed">{team.identity}</p>

              {/* Color Swatches */}
              <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-sm border border-white/20"
                    style={{backgroundColor: team.primaryColor}}
                  />
                  Primary
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-sm border border-white/20"
                    style={{backgroundColor: team.secondaryColor}}
                  />
                  Secondary
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span>Career Podiums:</span>
                  <strong className="text-slate-200 font-mono tabular-nums">
                    {team.stats.podiums}
                  </strong>
                </span>
              </div>

              {/* 4 Active Marbles */}
              <div className="mt-5 pt-4 border-t border-white/10">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Active Roster (4 Marbles)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {team.marbleIds.map((mId) => {
                    const marble = league.marbles[mId];
                    if (!marble) return null;
                    return (
                      <button
                        key={marble.id}
                        type="button"
                        onClick={() => {
                          onSelectTeam(team.id);
                          onInspectMarble(marble.id);
                        }}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-[#0b0e14] border border-white/8 hover:border-white/25 transition-colors text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <MarbleAvatar
                            primaryColor={team.primaryColor}
                            secondaryColor={team.secondaryColor}
                            accentColor={team.accentColor}
                            size={26}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">
                              {marble.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                              {marble.stats.wins}W · {marble.stats.appearances}R
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-slate-300 shrink-0">
                          <span title="Acceleration">A:{marble.attributes.acceleration}</span>
                          <span title="Top Speed">S:{marble.attributes.topSpeed}</span>
                          <span title="Handling">H:{marble.attributes.handling}</span>
                          <span title="Stability">T:{marble.attributes.stability}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
