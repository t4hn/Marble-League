import React from 'react';
import {Pencil, Check, X, ImagePlus, RotateCcw} from 'lucide-react';
import {LeagueState} from '../types/league';
import {calculateSeasonStandings} from '../engine/scoring';
import {processTeamLogoFile} from '../utils/logoImage';
import {MarbleAvatar, TeamEmblem} from './MarbleAvatar';

interface TeamsViewProps {
  league: LeagueState;
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string | null) => void;
  onInspectMarble: (marbleId: string) => void;
  onRenameTeam: (teamId: string, newName: string) => void;
  onUpdateTeamLogo: (teamId: string, logoDataUrl: string | null) => void;
}

export const TeamsView: React.FC<TeamsViewProps> = ({
  league,
  selectedTeamId,
  onSelectTeam,
  onInspectMarble,
  onRenameTeam,
  onUpdateTeamLogo,
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

  const [logoModalTeamId, setLogoModalTeamId] = React.useState<string | null>(null);
  const [pendingLogoUrl, setPendingLogoUrl] = React.useState<string | null>(null);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const [logoBusy, setLogoBusy] = React.useState<boolean>(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const logoModalTeam = logoModalTeamId ? league.teams[logoModalTeamId] : null;

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

  const openLogoEditor = (teamId: string) => {
    setLogoModalTeamId(teamId);
    setPendingLogoUrl(null);
    setLogoError(null);
    setLogoBusy(false);
  };

  const closeLogoEditor = () => {
    setLogoModalTeamId(null);
    setPendingLogoUrl(null);
    setLogoError(null);
    setLogoBusy(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    setLogoBusy(true);
    try {
      const normalizedUrl = await processTeamLogoFile(file);
      setPendingLogoUrl(normalizedUrl);
    } catch (err) {
      setPendingLogoUrl(null);
      setLogoError(err instanceof Error ? err.message : 'Unable to process image file.');
    } finally {
      setLogoBusy(false);
    }
  };

  const handleSaveLogo = () => {
    if (!logoModalTeamId || !pendingLogoUrl) return;
    onUpdateTeamLogo(logoModalTeamId, pendingLogoUrl);
    closeLogoEditor();
  };

  const handleRestoreDefaultLogo = () => {
    if (!logoModalTeamId) return;
    onUpdateTeamLogo(logoModalTeamId, null);
    closeLogoEditor();
  };

  React.useEffect(() => {
    if (!logoModalTeamId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLogoEditor();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [logoModalTeamId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            League Franchises
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Eight approved teams with four active marbles each. Display names and team logos can be customised while permanent IDs remain unchanged.
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
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <TeamEmblem team={team} size={44} />
                    <button
                      type="button"
                      aria-label={`Edit logo for ${team.name}`}
                      onClick={() => openLogoEditor(team.id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <ImagePlus className="w-3 h-3" />
                      Edit Logo
                    </button>
                  </div>

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

      {/* Team Logo Editor Dialog */}
      {logoModalTeam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="team-logo-dialog-title"
        >
          <div className="w-full max-w-md rounded-xl bg-[#121722] border border-white/15 p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-mono text-slate-400">
                  ID: {logoModalTeam.id}
                </div>
                <h2
                  id="team-logo-dialog-title"
                  className="font-display text-2xl font-bold text-white mt-0.5"
                >
                  Edit Team Logo · {logoModalTeam.name}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close logo editor"
                onClick={closeLogoEditor}
                className="p-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current vs New Preview */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-[#0b0e14] border border-white/10 flex flex-col items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-400">
                  Current Logo
                </span>
                <TeamEmblem team={logoModalTeam} size={76} />
              </div>

              <div className="p-4 rounded-lg bg-[#0b0e14] border border-white/10 flex flex-col items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-[#e5a93c]">
                  New Preview
                </span>
                {pendingLogoUrl ? (
                  <span className="inline-flex items-center justify-center rounded-md border border-[#e5a93c]/60 bg-[#0b0e14] overflow-hidden w-[76px] h-[76px]">
                    <img
                      src={pendingLogoUrl}
                      alt={`${logoModalTeam.name} new logo preview`}
                      className="w-full h-full object-contain p-1"
                    />
                  </span>
                ) : (
                  <div className="w-[76px] h-[76px] rounded-md border border-dashed border-white/20 flex items-center justify-center text-[11px] text-slate-500 text-center px-2">
                    Select file
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="team-logo-file-input"
                className="block text-xs font-medium text-slate-300"
              >
                Upload Replacement Image (PNG, JPG, or WEBP)
              </label>
              <input
                ref={fileInputRef}
                id="team-logo-file-input"
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20 file:cursor-pointer cursor-pointer"
              />
              <p className="text-[11px] text-slate-400">
                Square images are recommended. Non-square logos are fitted cleanly without stretching and transparency is preserved.
              </p>
              {logoError && (
                <p role="alert" className="text-xs text-red-400 font-medium">
                  {logoError}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={handleRestoreDefaultLogo}
                disabled={!logoModalTeam.logoDataUrl && !pendingLogoUrl}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/8 hover:bg-white/15 disabled:opacity-40 disabled:pointer-events-none text-xs font-medium text-slate-200 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore Default Logo
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeLogoEditor}
                  className="px-3.5 py-2 rounded-lg bg-white/8 hover:bg-white/15 text-xs font-semibold text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveLogo}
                  disabled={!pendingLogoUrl || logoBusy}
                  className="px-4 py-2 rounded-lg bg-[#e5a93c] hover:bg-[#f0b954] disabled:opacity-40 disabled:pointer-events-none text-[#0b0e14] text-xs font-bold cursor-pointer"
                >
                  Save Logo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
