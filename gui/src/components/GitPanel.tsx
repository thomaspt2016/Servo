import { useState, useEffect, useCallback } from "react";
import {
  GitBranch,
  GitCommit,
  RefreshCw,
  ChevronDown,
  Circle,
  Plus,
  Minus,
  FileEdit,
  FileQuestion,
  ArrowUp,
  ArrowDown,
  Layers,
  AlertCircle,
  Clock,
  User,
  Check,
  ChevronsUpDown,
  Archive,
  Globe,
  GitMerge,
  Upload,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GitInfo, GitChange } from "../types";

interface GitPanelProps {
  projectId: string;
  onInfoChange?: (info: GitInfo | null) => void;
}

const getChangeIcon = (type: GitChange["type"], staged: boolean) => {
  const cls = staged ? "text-emerald-400" : "text-amber-400";
  switch (type) {
    case "added":
      return <Plus className={`h-3 w-3 ${cls}`} />;
    case "deleted":
      return <Minus className={`h-3 w-3 text-red-400`} />;
    case "renamed":
      return <ChevronsUpDown className={`h-3 w-3 ${cls}`} />;
    case "untracked":
      return <FileQuestion className={`h-3 w-3 text-zinc-500`} />;
    case "modified":
    default:
      return <FileEdit className={`h-3 w-3 ${cls}`} />;
  }
};

const getChangeLabel = (type: GitChange["type"]) => {
  switch (type) {
    case "added": return "A";
    case "deleted": return "D";
    case "renamed": return "R";
    case "untracked": return "U";
    case "modified": return "M";
    default: return "?";
  }
};

const getChangeLabelColor = (type: GitChange["type"], staged: boolean) => {
  if (type === "deleted") return "text-red-400 bg-red-950/40 border-red-900/40";
  if (type === "untracked") return "text-zinc-500 bg-zinc-900/40 border-zinc-800/40";
  if (staged) return "text-emerald-400 bg-emerald-950/40 border-emerald-900/40";
  return "text-amber-400 bg-amber-950/40 border-amber-900/40";
};

function GitWorkflowRoadmap({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="mt-3 pt-3 pb-1 border-t border-zinc-900/50">
      <div className="flex items-center justify-between px-6">
        {/* Step 1: Stage */}
        <div className={`flex flex-col items-center transition-all ${step === 1 ? 'opacity-100 scale-105' : 'opacity-60'}`}>
          <div className={`h-6 w-6 rounded-full border flex items-center justify-center mb-1.5 transition-colors
            ${step === 1 ? 'bg-amber-950/30 border-amber-900/50 text-amber-500' : 'bg-emerald-950/30 border-emerald-900/50 text-emerald-500'}`}>
            {step > 1 ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </div>
          <span className={`text-[9px] font-medium ${step === 1 ? 'text-amber-500/80' : 'text-emerald-500/80'}`}>Stage</span>
        </div>
        
        <div className={`h-px flex-1 mx-2 mb-4 transition-colors ${step > 1 ? 'bg-emerald-900/50' : 'bg-zinc-800'}`}></div>
        
        {/* Step 2: Commit */}
        <div className={`flex flex-col items-center transition-all ${step === 2 ? 'opacity-100 scale-105' : step > 2 ? 'opacity-60' : 'opacity-40'}`}>
          <div className={`h-6 w-6 rounded-full border flex items-center justify-center mb-1.5 transition-colors
            ${step === 2 ? 'bg-primary/20 border-primary/50 text-primary' : step > 2 ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-500' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
            {step > 2 ? <Check className="h-3.5 w-3.5" /> : <GitMerge className="h-3.5 w-3.5" />}
          </div>
          <span className={`text-[9px] font-medium ${step === 2 ? 'text-primary' : step > 2 ? 'text-emerald-500/80' : 'text-zinc-400'}`}>Commit</span>
        </div>

        <div className={`h-px flex-1 mx-2 mb-4 transition-colors ${step > 2 ? 'bg-emerald-900/50' : 'bg-zinc-800'}`}></div>
        
        {/* Step 3: Push */}
        <div className={`flex flex-col items-center transition-all ${step === 3 ? 'opacity-100 scale-105' : 'opacity-40'}`}>
          <div className={`h-6 w-6 rounded-full border flex items-center justify-center mb-1.5 transition-colors
            ${step === 3 ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
            <Upload className="h-3.5 w-3.5" />
          </div>
          <span className={`text-[9px] font-medium ${step === 3 ? 'text-indigo-400' : 'text-zinc-400'}`}>Push</span>
        </div>
      </div>
      
      {step === 1 && (
        <p className="text-[10px] text-zinc-500 text-center mt-3">
          Click <Plus className="h-3 w-3 inline text-amber-500 mx-0.5 align-text-bottom" /> on files above to begin
        </p>
      )}
    </div>
  );
}

export function GitPanel({ projectId, onInfoChange }: GitPanelProps) {
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutMsg, setCheckoutMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"changes" | "commits" | "info">("changes");

  // Git operations state
  const [commitMsg, setCommitMsg] = useState("");
  const [opLoading, setOpLoading] = useState<string | null>(null); // which op is running
  const [opFeedback, setOpFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const showFeedback = (ok: boolean, msg: string) => {
    setOpFeedback({ ok, msg });
    setTimeout(() => setOpFeedback(null), 4000);
  };

  const fetchGitInfo = useCallback(async () => {
    if (!window.pywebview?.api) return;
    setLoading(true);
    setError(null);
    try {
      const info = await window.pywebview.api.git_get_info(projectId);
      if (info.error) {
        setError(info.error);
        setGitInfo(null);
        onInfoChange?.(null);
      } else {
        setGitInfo(info);
        onInfoChange?.(info);
      }
    } catch (e: any) {
      setError("Failed to fetch git info");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchGitInfo();
    // Refresh every 10s
    const interval = setInterval(fetchGitInfo, 10000);
    return () => clearInterval(interval);
  }, [fetchGitInfo]);

  const handleCheckout = async (branch: string) => {
    if (!window.pywebview?.api || branch === gitInfo?.branch) {
      setBranchDropdownOpen(false);
      return;
    }
    setCheckingOut(true);
    setBranchDropdownOpen(false);
    try {
      const res = await window.pywebview.api.git_checkout_branch(projectId, branch);
      setCheckoutMsg(res.message);
      if (res.success) {
        await fetchGitInfo();
      }
      setTimeout(() => setCheckoutMsg(null), 3000);
    } catch (e: any) {
      setCheckoutMsg("Failed to switch branch");
      setTimeout(() => setCheckoutMsg(null), 3000);
    } finally {
      setCheckingOut(false);
    }
  };

  const runOp = async (opKey: string, fn: () => Promise<{ success: boolean; message: string }>) => {
    if (!window.pywebview?.api) return;
    setOpLoading(opKey);
    try {
      const res = await fn();
      showFeedback(res.success, res.message);
      if (res.success) await fetchGitInfo();
    } catch (e: any) {
      showFeedback(false, e?.message || "Operation failed");
    } finally {
      setOpLoading(null);
    }
  };

  const handleStageAll   = () => runOp("stageAll",   () => window.pywebview!.api.git_stage_all(projectId));
  const handleUnstageAll = () => runOp("unstageAll", () => window.pywebview!.api.git_unstage_all(projectId));
  const handleStageFile  = (f: string) => runOp(`stage:${f}`,   () => window.pywebview!.api.git_stage_file(projectId, f));
  const handleUnstageFile= (f: string) => runOp(`unstage:${f}`, () => window.pywebview!.api.git_unstage_file(projectId, f));

  const handleCommit = () => runOp("commit", async () => {
    const res = await window.pywebview!.api.git_commit(projectId, commitMsg);
    if (res.success) setCommitMsg("");
    return res;
  });

  const handlePush = () => runOp("push", () =>
    window.pywebview!.api.git_push(
      projectId,
      Object.keys(gitInfo?.remotes ?? {})[0] || "origin",
      gitInfo?.branch || ""
    )
  );

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-2 text-center">
        <div className="h-10 w-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
          <AlertCircle className="h-5 w-5 text-zinc-500" />
        </div>
        <p className="text-xs text-zinc-500 font-medium">{error}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchGitInfo}
          className="text-xs text-zinc-500 hover:text-zinc-300 h-7 px-3"
        >
          <RefreshCw className="h-3 w-3 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (loading && !gitInfo) {
    return (
      <div className="flex items-center justify-center py-8 space-x-2 text-zinc-600">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading git info...</span>
      </div>
    );
  }

  if (!gitInfo) return null;

  const stagedChanges = gitInfo.changes.filter(c => c.staged);
  const unstagedChanges = gitInfo.changes.filter(c => !c.staged);

  return (
    <div className="flex flex-col space-y-4">
      {/* Header row: branch switcher + sync status + refresh */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Branch Switcher */}
        <div className="relative">
          <button
            onClick={() => setBranchDropdownOpen(v => !v)}
            disabled={checkingOut}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all text-xs font-mono group"
          >
            <GitBranch className="h-3.5 w-3.5 text-primary/80" />
            <span className="text-zinc-200 font-semibold max-w-[160px] truncate">
              {checkingOut ? "Switching..." : gitInfo.branch}
            </span>
            {gitInfo.branches.length > 1 && (
              <ChevronDown className={`h-3 w-3 text-zinc-500 transition-transform ${branchDropdownOpen ? "rotate-180" : ""}`} />
            )}
          </button>

          {branchDropdownOpen && gitInfo.branches.length > 0 && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setBranchDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-1.5 z-20 min-w-[200px] max-h-56 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl shadow-black/40 py-1">
                {gitInfo.branches.map(branch => (
                  <button
                    key={branch}
                    onClick={() => handleCheckout(branch)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-zinc-900 transition-colors ${branch === gitInfo.branch ? "text-primary font-semibold" : "text-zinc-300"}`}
                  >
                    <div className="flex items-center space-x-2">
                      <GitBranch className="h-3 w-3 opacity-60" />
                      <span className="font-mono">{branch}</span>
                    </div>
                    {branch === gitInfo.branch && <Check className="h-3 w-3 text-primary" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Sync Status (ahead/behind) */}
        <div className="flex items-center space-x-3">
          {(gitInfo.ahead > 0 || gitInfo.behind > 0) && (
            <div className="flex items-center space-x-2 text-[10px]">
              {gitInfo.ahead > 0 && (
                <span className="flex items-center space-x-1 text-sky-400 bg-sky-950/40 border border-sky-900/30 rounded-md px-2 py-0.5">
                  <ArrowUp className="h-2.5 w-2.5" />
                  <span>{gitInfo.ahead} ahead</span>
                </span>
              )}
              {gitInfo.behind > 0 && (
                <span className="flex items-center space-x-1 text-amber-400 bg-amber-950/40 border border-amber-900/30 rounded-md px-2 py-0.5">
                  <ArrowDown className="h-2.5 w-2.5" />
                  <span>{gitInfo.behind} behind</span>
                </span>
              )}
            </div>
          )}

          {gitInfo.has_changes && (
            <span className="flex items-center space-x-1 text-[10px] text-orange-400 bg-orange-950/40 border border-orange-900/30 rounded-md px-2 py-0.5">
              <Circle className="h-2 w-2 fill-orange-400" />
              <span>{gitInfo.changes.length} change{gitInfo.changes.length !== 1 ? "s" : ""}</span>
            </span>
          )}

          {!gitInfo.has_changes && gitInfo.ahead === 0 && gitInfo.behind === 0 && (
            <span className="flex items-center space-x-1 text-[10px] text-emerald-400 bg-emerald-950/30 border border-emerald-900/30 rounded-md px-2 py-0.5">
              <Check className="h-2.5 w-2.5" />
              <span>Clean</span>
            </span>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={fetchGitInfo}
            disabled={loading}
            className="h-7 w-7 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
            title="Refresh git status"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Checkout message toast */}
      {checkoutMsg && (
        <div className="text-xs px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center space-x-2">
          <Check className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
          <span>{checkoutMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center space-x-1 border-b border-zinc-900 pb-0">
        {(["changes", "commits", "info"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-[11px] font-medium rounded-t-md transition-all capitalize border-b-2 -mb-px ${
              activeTab === tab
                ? "text-primary border-primary bg-primary/5"
                : "text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-900/40"
            }`}
          >
            {tab === "changes" ? (
              <span className="flex items-center space-x-1.5">
                <span>Changes</span>
                {gitInfo.changes.length > 0 && (
                  <span className="text-[9px] bg-amber-900/50 border border-amber-800/50 text-amber-300 rounded-full px-1.5 py-px font-bold">
                    {gitInfo.changes.length}
                  </span>
                )}
              </span>
            ) : tab === "commits" ? (
              <span className="flex items-center space-x-1.5">
                <span>Commits</span>
                <span className="text-[9px] bg-zinc-900 border border-zinc-800 text-zinc-500 rounded-full px-1.5 py-px">
                  {gitInfo.commits.length}
                </span>
              </span>
            ) : "Repository"}
          </button>
        ))}
      </div>

      {/* Operation feedback toast */}
      {opFeedback && (
        <div className={`text-xs px-3 py-2 rounded-lg border flex items-start space-x-2 ${
          opFeedback.ok
            ? "bg-emerald-950/40 border-emerald-900/40 text-emerald-300"
            : "bg-red-950/40 border-red-900/40 text-red-300"
        }`}>
          {opFeedback.ok
            ? <Check className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            : <X className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />}
          <span className="break-all font-mono text-[10px]">{opFeedback.msg}</span>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === "changes" && (
        <div className="space-y-3">
          {gitInfo.changes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 space-y-2">
              <div className="h-8 w-8 rounded-full bg-emerald-950/30 border border-emerald-900/30 flex items-center justify-center">
                <Check className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-xs text-zinc-500">Working tree is clean</p>
            </div>
          )}

          {gitInfo.changes.length > 0 && (
            <>
              {/* ── Staged section ── */}
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-[10px] font-bold text-emerald-500/80 uppercase tracking-wider">
                    Staged ({stagedChanges.length})
                  </p>
                  {stagedChanges.length > 0 && (
                    <button
                      onClick={handleUnstageAll}
                      disabled={!!opLoading}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-0.5 rounded hover:bg-zinc-900"
                    >
                      Unstage all
                    </button>
                  )}
                </div>
                {stagedChanges.length === 0 ? (
                  <p className="text-[10px] text-zinc-600 italic px-1">No staged files yet</p>
                ) : (
                  <div className="space-y-1">
                    {stagedChanges.map((change, i) => (
                      <div
                        key={i}
                        className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-zinc-950/60 border border-zinc-900/60 group hover:border-zinc-800/80 hover:bg-zinc-900/30 transition-all"
                      >
                        {getChangeIcon(change.type, true)}
                        <span className="flex-1 text-[11px] font-mono text-zinc-300 break-all" title={change.file}>
                          {change.file}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-px rounded border ${getChangeLabelColor(change.type, true)}`}>
                          {getChangeLabel(change.type)}
                        </span>
                        {/* Unstage button */}
                        <button
                          onClick={() => handleUnstageFile(change.file)}
                          disabled={!!opLoading}
                          title="Unstage this file"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-500 hover:text-amber-400 hover:bg-amber-950/30 transition-all"
                        >
                          {opLoading === `unstage:${change.file}`
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Minus className="h-3 w-3" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Unstaged / Untracked section ── */}
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-[10px] font-bold text-amber-500/80 uppercase tracking-wider">
                    Unstaged ({unstagedChanges.length})
                  </p>
                  {unstagedChanges.length > 0 && (
                    <button
                      onClick={handleStageAll}
                      disabled={!!opLoading}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-0.5 rounded hover:bg-zinc-900"
                    >
                      {opLoading === "stageAll"
                        ? <span className="flex items-center space-x-1"><Loader2 className="h-2.5 w-2.5 animate-spin" /><span>Staging…</span></span>
                        : "Stage all"}
                    </button>
                  )}
                </div>
                {unstagedChanges.length === 0 ? (
                  <p className="text-[10px] text-zinc-600 italic px-1">All changes staged</p>
                ) : (
                  <div className="space-y-1">
                    {unstagedChanges.map((change, i) => (
                      <div
                        key={i}
                        className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-zinc-950/60 border border-zinc-900/60 group hover:border-zinc-800/80 hover:bg-zinc-900/30 transition-all"
                      >
                        {getChangeIcon(change.type, false)}
                        <span className="flex-1 text-[11px] font-mono text-zinc-400 break-all" title={change.file}>
                          {change.file}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-px rounded border ${getChangeLabelColor(change.type, false)}`}>
                          {getChangeLabel(change.type)}
                        </span>
                        {/* Stage button */}
                        <button
                          onClick={() => handleStageFile(change.file)}
                          disabled={!!opLoading}
                          title="Stage this file"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-500 hover:text-emerald-400 hover:bg-emerald-950/30 transition-all"
                        >
                          {opLoading === `stage:${change.file}`
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Plus className="h-3 w-3" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Commit + Push bar ── always visible when there are any changes or staged files ── */}
          {(gitInfo.changes.length > 0 || stagedChanges.length > 0) && (
            <div className="pt-2 border-t border-zinc-900/60 space-y-2">
              {/* Commit message */}
              <div className="relative">
                <textarea
                  value={commitMsg}
                  onChange={e => setCommitMsg(e.target.value)}
                  placeholder="Commit message…"
                  rows={2}
                  maxLength={300}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 font-mono resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                />
                <span className="absolute bottom-2 right-2.5 text-[9px] text-zinc-700">{commitMsg.length}/300</span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center space-x-2">
                {/* Commit */}
                <button
                  onClick={handleCommit}
                  disabled={!!opLoading || stagedChanges.length === 0 || !commitMsg.trim()}
                  className="flex-1 flex items-center justify-center space-x-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-primary/90 hover:bg-primary text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-primary/20"
                >
                  {opLoading === "commit"
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Committing…</span></>
                    : <><GitMerge className="h-3.5 w-3.5" /><span>Commit</span>
                       {stagedChanges.length > 0 && <span className="text-[10px] opacity-70">({stagedChanges.length})</span>}
                      </>}
                </button>

                {/* Push */}
                {Object.keys(gitInfo.remotes).length > 0 && (
                  <button
                    onClick={handlePush}
                    disabled={!!opLoading || gitInfo.ahead === 0}
                    title={gitInfo.ahead === 0 ? "Nothing to push" : `Push ${gitInfo.ahead} commit(s) to ${Object.keys(gitInfo.remotes)[0]}`}
                    className="flex items-center space-x-1.5 h-8 px-3 rounded-lg text-xs font-semibold border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 hover:bg-zinc-800/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {opLoading === "push"
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Pushing…</span></>
                      : <><Upload className="h-3.5 w-3.5" /><span>Push</span>
                         {gitInfo.ahead > 0 && <span className="text-[10px] opacity-60">↑{gitInfo.ahead}</span>}
                        </>}
                  </button>
                )}
              </div>

              {/* Hint when nothing staged */}
              <GitWorkflowRoadmap step={stagedChanges.length > 0 ? 2 : 1} />
            </div>
          )}

          {/* Push-only bar when tree is clean but commits are ahead */}
          {gitInfo.changes.length === 0 && gitInfo.ahead > 0 && Object.keys(gitInfo.remotes).length > 0 && (
            <div className="pt-2 border-t border-zinc-900/60">
              <button
                onClick={handlePush}
                disabled={!!opLoading}
                className="w-full flex items-center justify-center space-x-2 h-8 px-3 rounded-lg text-xs font-semibold border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 hover:bg-zinc-800/60 disabled:opacity-40 transition-all"
              >
                {opLoading === "push"
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Pushing…</span></>
                  : <><Upload className="h-3.5 w-3.5" /><span>Push {gitInfo.ahead} commit{gitInfo.ahead !== 1 ? "s" : ""} to {Object.keys(gitInfo.remotes)[0]}</span></>}
              </button>
              <GitWorkflowRoadmap step={3} />
            </div>
          )}
        </div>
      )}

      {activeTab === "commits" && (
        <div className="space-y-1.5">
          {gitInfo.commits.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-6">No commits found</p>
          ) : (
            gitInfo.commits.map((commit, i) => (
              <div
                key={commit.full_hash}
                className="flex items-start space-x-3 px-3 py-2.5 rounded-lg bg-zinc-950/40 border border-zinc-900/60 hover:border-zinc-800/80 hover:bg-zinc-900/20 transition-all group"
              >
                <div className="flex flex-col items-center pt-0.5 flex-shrink-0">
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center border ${
                    i === 0
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-zinc-900 border-zinc-800 text-zinc-600"
                  }`}>
                    <GitCommit className="h-2.5 w-2.5" />
                  </div>
                  {i < gitInfo.commits.length - 1 && (
                    <div className="w-px flex-1 min-h-[8px] mt-1 bg-zinc-900" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-zinc-200 font-medium leading-snug line-clamp-2">
                    {commit.message}
                  </p>
                  <div className="flex items-center space-x-3 mt-1 text-[10px] text-zinc-600">
                    <span className="font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 px-1.5 py-px rounded text-[9px]">
                      {commit.hash}
                    </span>
                    <span className="flex items-center space-x-1">
                      <User className="h-2.5 w-2.5" />
                      <span className="truncate max-w-[80px]">{commit.author}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Clock className="h-2.5 w-2.5" />
                      <span>{commit.time}</span>
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "info" && (
        <div className="space-y-4">
          {/* Repo Root */}
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 px-1">Repository Root</p>
            <div className="px-3 py-2.5 rounded-lg bg-zinc-950/60 border border-zinc-900/60">
              <span className="text-[11px] font-mono text-zinc-400 break-all">{gitInfo.repo_root}</span>
            </div>
          </div>

          {/* Remotes */}
          {Object.keys(gitInfo.remotes).length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 px-1 flex items-center space-x-1.5">
                <Globe className="h-3 w-3" />
                <span>Remotes</span>
              </p>
              <div className="space-y-1.5">
                {Object.entries(gitInfo.remotes).map(([name, url]) => (
                  <div key={name} className="flex items-center space-x-3 px-3 py-2 rounded-lg bg-zinc-950/60 border border-zinc-900/60">
                    <span className="text-[10px] font-bold text-zinc-400 min-w-[50px]">{name}</span>
                    <span className="text-[11px] font-mono text-zinc-500 truncate flex-1" title={url}>{url}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stashes */}
          {gitInfo.stashes.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 px-1 flex items-center space-x-1.5">
                <Archive className="h-3 w-3" />
                <span>Stashes ({gitInfo.stashes.length})</span>
              </p>
              <div className="space-y-1">
                {gitInfo.stashes.map((stash, i) => (
                  <div key={i} className="px-3 py-2 rounded-lg bg-zinc-950/60 border border-zinc-900/60">
                    <span className="text-[11px] font-mono text-zinc-500">{stash}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Branches */}
          {gitInfo.branches.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 px-1 flex items-center space-x-1.5">
                <Layers className="h-3 w-3" />
                <span>Local Branches ({gitInfo.branches.length})</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {gitInfo.branches.map(branch => (
                  <button
                    key={branch}
                    onClick={() => handleCheckout(branch)}
                    disabled={branch === gitInfo.branch || checkingOut}
                    className={`flex items-center space-x-1.5 text-[11px] font-mono px-2.5 py-1 rounded-md border transition-all ${
                      branch === gitInfo.branch
                        ? "bg-primary/15 border-primary/40 text-primary cursor-default"
                        : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900/50 cursor-pointer"
                    }`}
                    title={branch === gitInfo.branch ? "Current branch" : `Switch to ${branch}`}
                  >
                    <GitBranch className="h-2.5 w-2.5" />
                    <span>{branch}</span>
                    {branch === gitInfo.branch && <Check className="h-2.5 w-2.5" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
