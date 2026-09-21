import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/auth';
import {
  Plus, Trash2, Loader2, AlertTriangle, X, CheckCircle,
  XCircle, Clock, ShieldAlert, RefreshCw, Eye, EyeOff,
  Play, Square, Pause, ScrollText, Bot, Zap, Lock, Radio,
  Heart, MessageCircle, Bookmark, UserPlus
} from 'lucide-react';

interface TikTokAccount {
  id: string;
  name: string;
  handle?: string;
  userId?: string;
  cookieCount: number;
  cookieFormat: string;
  status: 'untested' | 'active' | 'failed' | 'suspended' | 'locked';
  profileName?: string;
  lastVerified?: string;
  lastError?: string;
  createdAt: string;
}

interface ParsePreview {
  valid: boolean;
  format: string;
  cookieCount: number;
  cookieNames: string[];
  userId?: string;
  missing: string[];
  warnings: string[];
  error?: string;
}

interface AgentStatus {
  accountId: string;
  state: 'stopped' | 'running' | 'paused' | 'error';
  sessionId: string | null;
  currentAction: string | null;
  stats: {
    likes: number; comments: number; follows: number; saves: number;
    errors: number; totalActions: number; actionsThisHour: number;
    lastActionAt: string | null;
  };
  lastError: string | null;
  startedAt: string | null;
  config?: Record<string, unknown>;
}

interface AgentLog {
  timestamp: string;
  action: string;
  status: 'success' | 'error' | 'skipped' | 'info';
  message: string;
}

interface TikTokProviderDescriptor {
  name: 'web' | 'android' | 'dry-run';
  label: string;
  mode: string;
  capabilities: {
    checkRelationship: boolean;
    follow: boolean;
    unfollow: boolean;
    like: boolean;
    comment: boolean;
    dm: boolean;
  };
}

interface TikTokRuntimeStatus {
  state: 'stopped' | 'running' | 'paused';
  started: boolean;
  paused: boolean;
  tickActive: boolean;
  intervalMs: number;
  registeredProviders: string[];
  lastRunStartedAt: string | null;
  lastRunCompletedAt: string | null;
  lastResult: {
    scanned: number;
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
  } | null;
  lastError: string | null;
}

interface TikTokProviderStatus {
  providers: TikTokProviderDescriptor[];
  registeredProviders: string[];
  browserProvider: {
    registered: boolean;
    persistentProfiles: boolean;
    sessionReuse: boolean;
    challengePolicy: string;
  };
  runtime: TikTokRuntimeStatus;
}

interface RelationshipObservationResult {
  provider: string;
  targetKey: string;
  relationship: string;
  observedAt: string;
  details?: {
    targetUsername?: string;
    ownHandle?: string;
    mobileDevice?: string;
    sessionReused?: boolean;
    cookieBootstrapApplied?: boolean;
    reason?: string;
    stage?: string;
  };
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  active:    { icon: CheckCircle,  color: 'text-green-400',  bg: 'bg-green-500/10', label: 'Active' },
  untested:  { icon: Clock,        color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Untested' },
  failed:    { icon: XCircle,      color: 'text-red-400',    bg: 'bg-red-500/10',    label: 'Failed' },
  suspended: { icon: ShieldAlert,  color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Suspended' },
  locked:    { icon: Lock,         color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Locked' },
};

const ACTION_COLORS: Record<string, string> = {
  like: 'text-pink-400',
  comment: 'text-blue-400',
  follow: 'text-sky-400',
  save: 'text-amber-400',
  system: 'text-zinc-400',
};

export default function TikTokTab() {
  const { token } = useAuthStore();
  const [accounts, setAccounts] = useState<TikTokAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCookies, setNewCookies] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [preview, setPreview] = useState<ParsePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showCookies, setShowCookies] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  // Automation core/provider state
  const [providerStatus, setProviderStatus] = useState<TikTokProviderStatus | null>(null);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [relationshipUsername, setRelationshipUsername] = useState('');
  const [relationshipObservation, setRelationshipObservation] = useState<RelationshipObservationResult | null>(null);
  const [relationshipChecking, setRelationshipChecking] = useState(false);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  // Agent state
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  // Agent config form
  const [configActions, setConfigActions] = useState<string[]>(['like', 'comment', 'follow', 'save']);
  const [configTone, setConfigTone] = useState('AI and tech enthusiast. Authentic, curious, and friendly. Speaks like a real TikTok user who genuinely loves AI tools. Short, punchy comments that add value. Never robotic or generic.');
  const [configLang, setConfigLang] = useState('English');
  const [configTopics, setConfigTopics] = useState('AI agents, AI automation, ChatGPT, Claude, AI tools, tech, no-code, productivity');
  const [configHashtags, setConfigHashtags] = useState('#AI, #AIagents, #automation, #ChatGPT, #Tech');
  const [configTargets, setConfigTargets] = useState('');
  const [configTestMode, setConfigTestMode] = useState(false);
  const logsPanelRef = useRef<HTMLDivElement>(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/tiktok/accounts', { headers });
      const data = await res.json();
      setAccounts(data.accounts ?? []);
    } catch { setError('Failed to load accounts'); }
    finally { setLoading(false); }
  }, [token]);

  const fetchProviderStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/tiktok/provider-status', { headers });
      if (!res.ok) return;
      const data = await res.json();
      setProviderStatus(data);
    } catch { /* silent */ }
  }, [token]);

  const fetchAgentStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/tiktok-agent/agents', { headers });
      const data = await res.json();
      const agents = data.agents ?? [];
      setAgentStatus(agents.length > 0 ? agents[0] : null);
    } catch { /* silent */ }
  }, [token]);

  const fetchAgentLogs = useCallback(async () => {
    if (!agentStatus) return;
    try {
      const res = await fetch(`/api/tiktok-agent/agents/${agentStatus.accountId}/logs?limit=100`, { headers });
      const data = await res.json();
      setAgentLogs(data.logs ?? []);
    } catch { /* silent */ }
  }, [token, agentStatus?.accountId]);

  useEffect(() => {
    fetchAccounts();
    fetchAgentStatus();
    fetchProviderStatus();
  }, [fetchAccounts, fetchAgentStatus, fetchProviderStatus]);

  useEffect(() => {
    if (!selectedProvider && providerStatus?.providers.length) {
      setSelectedProvider(providerStatus.providers[0].name);
    }
  }, [providerStatus, selectedProvider]);

  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      const activeAccount = accounts.find(account => account.status === 'active') ?? accounts[0];
      setSelectedAccountId(activeAccount.id);
    }
  }, [accounts, selectedAccountId]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchProviderStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchProviderStatus]);

  // Auto-refresh logs every 5s when agent is running
  useEffect(() => {
    if (!agentStatus || agentStatus.state === 'stopped') return;
    fetchAgentLogs();
    const interval = setInterval(() => {
      fetchAgentLogs();
      fetchAgentStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [agentStatus?.accountId, agentStatus?.state, fetchAgentLogs, fetchAgentStatus]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logsPanelRef.current) {
      logsPanelRef.current.scrollTop = logsPanelRef.current.scrollHeight;
    }
  }, [agentLogs, autoScroll]);

  // Auto-open logs when agent starts
  useEffect(() => {
    if (agentStatus && agentStatus.state === 'running') setShowLogs(true);
  }, [agentStatus?.state]);

  const previewCookies = async () => {
    if (!newCookies.trim()) return;
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/tiktok/parse-preview', {
        method: 'POST', headers, body: JSON.stringify({ cookies: newCookies }),
      });
      setPreview(await res.json());
    } catch { setPreview(null); }
    finally { setPreviewLoading(false); }
  };

  const addAccount = async () => {
    if (!newName.trim() || !newCookies.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch('/api/tiktok/accounts', {
        method: 'POST', headers, body: JSON.stringify({ name: newName, cookies: newCookies }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error); return; }
      setShowAdd(false); setNewName(''); setNewCookies(''); setPreview(null);
      fetchAccounts();
    } catch { setError('Failed to add account'); }
    finally { setAddLoading(false); }
  };

  const deleteAccount = async (id: string) => {
    if (!confirm('Delete this TikTok account?')) return;
    await fetch(`/api/tiktok/accounts/${id}`, { method: 'DELETE', headers });
    fetchAccounts();
  };

  const verifyAccount = async (id: string) => {
    setVerifyingId(id);
    try {
      const res = await fetch(`/api/tiktok/accounts/${id}/verify`, { method: 'POST', headers });
      const data = await res.json();
      if (!data.success) setError(data.error || 'Verification failed');
      fetchAccounts();
    } catch { setError('Verification failed'); }
    finally { setVerifyingId(null); }
  };

  const checkRelationship = async () => {
    const cleanUsername = relationshipUsername.trim().replace(/^@/, '');
    if (!selectedProvider || !cleanUsername) return;

    if (selectedProvider === 'web' && !selectedAccountId) {
      setError('Select a TikTok Web account first');
      return;
    }

    setRelationshipChecking(true);
    setRelationshipObservation(null);

    try {
      const res = await fetch('/api/tiktok/provider/check-relationship', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider: selectedProvider,
          accountId: selectedAccountId || undefined,
          username: cleanUsername,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Relationship check failed');
        return;
      }

      setRelationshipObservation(data.observation ?? null);
      fetchProviderStatus();
    } catch {
      setError('Relationship check failed');
    } finally {
      setRelationshipChecking(false);
    }
  };

  const controlRuntime = async (
    action: 'start' | 'pause' | 'resume' | 'stop',
  ) => {
    setRuntimeLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/tiktok/runtime/${action}`, {
        method: 'POST',
        headers,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `Runtime ${action} failed`);
        return;
      }

      setProviderStatus(prev => prev
        ? { ...prev, runtime: data.runtime }
        : prev);

      await fetchProviderStatus();
    } catch {
      setError(`Runtime ${action} failed`);
    } finally {
      setRuntimeLoading(false);
    }
  };

  const startAgent = async (accountId: string) => {
    setAgentLoading(true);
    try {
      const res = await fetch('/api/tiktok-agent/agents', {
        method: 'POST', headers,
        body: JSON.stringify({
          accountId,
          config: {
            actions: configActions,
            content: {
              tone: configTone,
              language: configLang,
              topics: configTopics.split(',').map(s => s.trim()).filter(Boolean),
              hashtags: configHashtags.split(',').map(s => s.trim()).filter(Boolean),
              targetAccounts: configTargets ? configTargets.split(',').map(s => s.trim()).filter(Boolean) : [],
              maxLength: 150,
            },
            safety: {
              minDelaySeconds: 180,
              maxActionsPerHour: 5,
              pauseOnErrorCount: 2,
              pauseDurationMinutes: 120,
            },
            testMode: configTestMode,
          },
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error); return; }
      fetchAgentStatus();
    } catch { setError('Failed to start agent'); }
    finally { setAgentLoading(false); }
  };

  const stopAgent = async () => {
    if (!agentStatus) return;
    setAgentLoading(true);
    try {
      await fetch(`/api/tiktok-agent/agents/${agentStatus.accountId}/stop`, { method: 'POST', headers });
      setAgentStatus(null); setAgentLogs([]);
    } catch { setError('Failed to stop agent'); }
    finally { setAgentLoading(false); }
  };

  const pauseAgent = async () => {
    if (!agentStatus) return;
    await fetch(`/api/tiktok-agent/agents/${agentStatus.accountId}/pause`, { method: 'POST', headers });
    fetchAgentStatus();
  };

  const resumeAgent = async () => {
    if (!agentStatus) return;
    await fetch(`/api/tiktok-agent/agents/${agentStatus.accountId}/resume`, { method: 'POST', headers });
    fetchAgentStatus();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-2xl">🎵</span> TikTok Agent
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Autonomous engagement — like, comment, follow, save</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Add Account
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Automation Core / Provider Controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-sky-400" />
              Automation Core
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Persistent relationship checks and 48h follow-back scheduling
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              providerStatus?.browserProvider.registered
                ? 'bg-green-500/15 text-green-400'
                : 'bg-zinc-800 text-zinc-500'
            }`}>
              {providerStatus?.browserProvider.registered ? 'Web provider registered' : 'Web provider offline'}
            </span>
            <button
              onClick={fetchProviderStatus}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
              title="Refresh provider status"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="mb-4 border border-zinc-800 rounded-lg p-3 bg-zinc-950/40">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                providerStatus?.runtime.state === 'running'
                  ? 'bg-green-500/15 text-green-400'
                  : providerStatus?.runtime.state === 'paused'
                    ? 'bg-yellow-500/15 text-yellow-400'
                    : 'bg-zinc-800 text-zinc-400'
              }`}>
                Runtime: {providerStatus?.runtime.state ?? 'unknown'}
              </span>

              <span className="px-2 py-1 rounded bg-zinc-800 text-xs text-zinc-400">
                Tick: {providerStatus?.runtime.tickActive ? 'active' : 'idle'}
              </span>

              <span className="px-2 py-1 rounded bg-zinc-800 text-xs text-zinc-400">
                Interval: {providerStatus?.runtime.intervalMs ? `${Math.round(providerStatus.runtime.intervalMs / 1000)}s` : '—'}
              </span>

              <span className="px-2 py-1 rounded bg-zinc-800 text-xs text-zinc-400">
                Providers: {providerStatus?.runtime.registeredProviders?.join(', ') || '—'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {providerStatus?.runtime.state === 'stopped' && (
                <button
                  onClick={() => void controlRuntime('start')}
                  disabled={runtimeLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded text-xs font-medium"
                >
                  {runtimeLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  Start
                </button>
              )}

              {providerStatus?.runtime.state === 'running' && (
                <button
                  onClick={() => void controlRuntime('pause')}
                  disabled={runtimeLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 rounded text-xs font-medium"
                >
                  {runtimeLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />}
                  Pause
                </button>
              )}

              {providerStatus?.runtime.state === 'paused' && (
                <button
                  onClick={() => void controlRuntime('resume')}
                  disabled={runtimeLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded text-xs font-medium"
                >
                  {runtimeLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  Resume
                </button>
              )}

              {providerStatus?.runtime.state !== 'stopped' && (
                <button
                  onClick={() => void controlRuntime('stop')}
                  disabled={runtimeLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded text-xs font-medium"
                >
                  <Square className="w-3 h-3" />
                  Stop
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mt-3 text-xs">
            <div>
              <div className="text-zinc-600">Last tick</div>
              <div className="text-zinc-300">
                {providerStatus?.runtime.lastRunCompletedAt
                  ? new Date(providerStatus.runtime.lastRunCompletedAt).toLocaleString()
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-zinc-600">Scanned</div>
              <div className="text-zinc-300">{providerStatus?.runtime.lastResult?.scanned ?? '—'}</div>
            </div>
            <div>
              <div className="text-zinc-600">Processed</div>
              <div className="text-zinc-300">{providerStatus?.runtime.lastResult?.processed ?? '—'}</div>
            </div>
            <div>
              <div className="text-zinc-600">Succeeded / Failed</div>
              <div className="text-zinc-300">
                {providerStatus?.runtime.lastResult
                  ? `${providerStatus.runtime.lastResult.succeeded} / ${providerStatus.runtime.lastResult.failed}`
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-zinc-600">Last error</div>
              <div className={providerStatus?.runtime.lastError ? 'text-red-400 truncate' : 'text-zinc-300'}>
                {providerStatus?.runtime.lastError ?? 'none'}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Provider</label>
            <select
              value={selectedProvider}
              onChange={e => {
                setSelectedProvider(e.target.value);
                setRelationshipObservation(null);
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
            >
              {(providerStatus?.providers ?? []).map(provider => (
                <option key={provider.name} value={provider.name}>
                  {provider.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Account</label>
            <select
              value={selectedAccountId}
              onChange={e => {
                setSelectedAccountId(e.target.value);
                setRelationshipObservation(null);
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
            >
              <option value="">Select account</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.handle ? `@${account.handle}` : account.name} — {account.status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Relationship target</label>
            <div className="flex gap-2">
              <input
                value={relationshipUsername}
                onChange={e => setRelationshipUsername(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void checkRelationship();
                }}
                placeholder="@username"
                className="min-w-0 flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600"
              />
              <button
                onClick={() => void checkRelationship()}
                disabled={relationshipChecking || !selectedProvider || !relationshipUsername.trim()}
                className="px-3 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-zinc-700 disabled:text-zinc-500 rounded text-xs font-medium transition-colors whitespace-nowrap"
              >
                {relationshipChecking
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : 'Check'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs mb-3">
          <span className="px-2 py-1 rounded bg-sky-500/10 text-sky-400">
            Relationship check: read-only
          </span>
          <span className="px-2 py-1 rounded bg-zinc-800 text-zinc-400">
            Provider Follow: disabled
          </span>
          <span className="px-2 py-1 rounded bg-zinc-800 text-zinc-400">
            Provider Unfollow: disabled
          </span>
          <span className="px-2 py-1 rounded bg-zinc-800 text-zinc-400">
            Persistent profile: {providerStatus?.browserProvider.persistentProfiles ? 'ON' : '—'}
          </span>
          <span className="px-2 py-1 rounded bg-zinc-800 text-zinc-400">
            Session reuse: {providerStatus?.browserProvider.sessionReuse ? 'ON' : '—'}
          </span>
          <span className="px-2 py-1 rounded bg-zinc-800 text-zinc-400">
            Challenge: UNKNOWN + retry
          </span>
        </div>

        {relationshipObservation && (
          <div className="border border-zinc-700 rounded-lg p-3 bg-zinc-950/60">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Observed relationship</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  relationshipObservation.relationship === 'unknown'
                    ? 'bg-yellow-500/15 text-yellow-400'
                    : 'bg-green-500/15 text-green-400'
                }`}>
                  {relationshipObservation.relationship}
                </span>
              </div>
              <span className="text-xs text-zinc-600">
                {new Date(relationshipObservation.observedAt).toLocaleString()}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
              <div>
                <div className="text-zinc-600">Provider</div>
                <div className="text-zinc-300">{relationshipObservation.provider}</div>
              </div>
              <div>
                <div className="text-zinc-600">Target</div>
                <div className="text-zinc-300">@{relationshipObservation.details?.targetUsername ?? relationshipUsername.replace(/^@/, '')}</div>
              </div>
              <div>
                <div className="text-zinc-600">Device</div>
                <div className="text-zinc-300">{relationshipObservation.details?.mobileDevice ?? '—'}</div>
              </div>
              <div>
                <div className="text-zinc-600">Session reused</div>
                <div className="text-zinc-300">{relationshipObservation.details?.sessionReused === true ? 'yes' : relationshipObservation.details?.sessionReused === false ? 'no' : '—'}</div>
              </div>
            </div>

            {relationshipObservation.details?.reason && (
              <div className="mt-2 text-xs text-yellow-400">
                {relationshipObservation.details.reason}
                {relationshipObservation.details.stage ? ` — ${relationshipObservation.details.stage}` : ''}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Agent Status Bar */}
      {agentStatus && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Bot className="w-5 h-5 text-pink-400" />
              <span className="font-medium text-white">TikTok Agent</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                agentStatus.state === 'running' ? 'bg-green-500/20 text-green-400' :
                agentStatus.state === 'paused' ? 'bg-yellow-500/20 text-yellow-400' :
                agentStatus.state === 'error' ? 'bg-red-500/20 text-red-400' :
                'bg-zinc-500/20 text-zinc-400'
              }`}>
                {agentStatus.state === 'running' && <Radio className="w-3 h-3 inline mr-1 animate-pulse" />}
                {agentStatus.state}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {agentStatus.state === 'running' && (
                <button onClick={pauseAgent} className="p-1.5 rounded hover:bg-zinc-800 text-yellow-400" title="Pause"><Pause className="w-4 h-4" /></button>
              )}
              {agentStatus.state === 'paused' && (
                <button onClick={resumeAgent} className="p-1.5 rounded hover:bg-zinc-800 text-green-400" title="Resume"><Play className="w-4 h-4" /></button>
              )}
              <button onClick={stopAgent} disabled={agentLoading} className="p-1.5 rounded hover:bg-zinc-800 text-red-400" title="Stop">
                {agentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              </button>
              <button onClick={() => setShowLogs(!showLogs)} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400" title="Toggle logs">
                <ScrollText className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-6 gap-3 text-center">
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-lg font-bold text-pink-400">{agentStatus.stats.likes}</div>
              <div className="text-xs text-zinc-500">Likes</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-lg font-bold text-blue-400">{agentStatus.stats.comments}</div>
              <div className="text-xs text-zinc-500">Comments</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-lg font-bold text-sky-400">{agentStatus.stats.follows}</div>
              <div className="text-xs text-zinc-500">Follows</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-lg font-bold text-amber-400">{agentStatus.stats.saves}</div>
              <div className="text-xs text-zinc-500">Saves</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-lg font-bold text-white">{agentStatus.stats.totalActions}</div>
              <div className="text-xs text-zinc-500">Total</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-lg font-bold text-red-400">{agentStatus.stats.errors}</div>
              <div className="text-xs text-zinc-500">Errors</div>
            </div>
          </div>

          {agentStatus.lastError && (
            <div className="mt-2 text-xs text-red-400 bg-red-500/5 rounded p-2 truncate">{agentStatus.lastError}</div>
          )}

          {/* Live Logs Panel */}
          {showLogs && (
            <div className="mt-3 border border-zinc-700 rounded-lg overflow-hidden">
              {/* Config summary bar */}
              {agentStatus.config && (
                <div className="px-3 py-1.5 bg-zinc-800/80 border-b border-zinc-700 flex items-center gap-3 text-xs text-zinc-400 overflow-x-auto">
                  <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-pink-400" /> {(agentStatus.config as Record<string, unknown>).actions ? String((agentStatus.config as Record<string, unknown>).actions) : 'like,follow'}</span>
                  <span>|</span>
                  <span>{agentStatus.stats.actionsThisHour}/{5} this hour</span>
                </div>
              )}
              <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-700">
                <span className="text-xs text-zinc-400 flex items-center gap-1">
                  <Radio className="w-3 h-3 text-green-400 animate-pulse" /> Live Logs ({agentLogs.length})
                </span>
                <button onClick={() => setAutoScroll(!autoScroll)} className={`text-xs px-2 py-0.5 rounded ${autoScroll ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-400'}`}>
                  Auto-scroll {autoScroll ? 'ON' : 'OFF'}
                </button>
              </div>
              <div ref={logsPanelRef} className="max-h-64 overflow-y-auto bg-zinc-950 font-mono text-xs">
                {agentLogs.length === 0 ? (
                  <div className="p-4 text-center text-zinc-500">Waiting for agent actions...</div>
                ) : agentLogs.map((log, i) => (
                  <div key={i} className={`px-3 py-1 border-b border-zinc-800/50 flex items-start gap-2 ${log.status === 'error' ? 'bg-red-500/5' : ''}`}>
                    <span className="text-zinc-600 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className={`shrink-0 ${
                      log.status === 'success' ? 'text-green-400' :
                      log.status === 'error' ? 'text-red-400' :
                      log.status === 'skipped' ? 'text-yellow-400' :
                      'text-zinc-500'
                    }`}>
                      {log.status === 'success' ? '✓' : log.status === 'error' ? '✗' : log.status === 'skipped' ? '⊘' : '•'}
                    </span>
                    <span className={`shrink-0 font-medium ${ACTION_COLORS[log.action] ?? 'text-zinc-400'}`}>{log.action}</span>
                    <span className="text-zinc-300 truncate">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Accounts List */}
      {accounts.length === 0 && !showAdd ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">🎵</div>
          <h3 className="text-lg font-medium text-white mb-2">No TikTok accounts yet</h3>
          <p className="text-zinc-400 text-sm mb-4">Add your TikTok cookies to start the autonomous agent</p>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-pink-600 hover:bg-pink-700 rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4 inline mr-1" /> Add Account
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(account => {
            const statusCfg = STATUS_CONFIG[account.status] || STATUS_CONFIG.untested;
            const StatusIcon = statusCfg.icon;
            const isRunning = agentStatus?.accountId === account.id && agentStatus.state !== 'stopped';

            return (
              <div key={account.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${statusCfg.bg}`}>
                      <StatusIcon className={`w-5 h-5 ${statusCfg.color}`} />
                    </div>
                    <div>
                      <div className="font-medium text-white flex items-center gap-2">
                        {account.name}
                        {account.handle && <span className="text-zinc-400 text-sm">@{account.handle}</span>}
                        {isRunning && <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">Agent running</span>}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {account.cookieCount} cookies ({account.cookieFormat}) | {statusCfg.label}
                        {account.lastVerified && ` | Verified ${new Date(account.lastVerified).toLocaleString()}`}
                      </div>
                      {account.lastError && <div className="text-xs text-red-400 mt-1">{account.lastError}</div>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={() => verifyAccount(account.id)} disabled={verifyingId === account.id}
                      className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white" title="Verify login">
                      {verifyingId === account.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                    {!isRunning && account.status === 'active' && (
                      <button onClick={() => startAgent(account.id)} disabled={agentLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-xs font-medium transition-colors">
                        {agentLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        Start Agent
                      </button>
                    )}
                    <button onClick={() => deleteAccount(account.id)} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-red-400" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Agent Config (shown when no agent is running) */}
      {!agentStatus && accounts.some(a => a.status === 'active') && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-pink-400" /> Agent Configuration</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Actions</label>
              <div className="flex flex-wrap gap-2">
                {['like', 'comment', 'follow', 'save'].map(action => (
                  <button key={action} onClick={() => {
                    setConfigActions(prev => prev.includes(action) ? prev.filter(a => a !== action) : [...prev, action]);
                  }} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                    configActions.includes(action) ? 'bg-pink-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}>
                    {action === 'like' && <Heart className="w-3 h-3" />}
                    {action === 'comment' && <MessageCircle className="w-3 h-3" />}
                    {action === 'follow' && <UserPlus className="w-3 h-3" />}
                    {action === 'save' && <Bookmark className="w-3 h-3" />}
                    {action}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Language</label>
              <input value={configLang} onChange={e => setConfigLang(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white" />
            </div>

            <div className="col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">Tone / Persona</label>
              <textarea value={configTone} onChange={e => setConfigTone(e.target.value)} rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white" />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Topics (comma-separated)</label>
              <input value={configTopics} onChange={e => setConfigTopics(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white" />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Hashtags (comma-separated)</label>
              <input value={configHashtags} onChange={e => setConfigHashtags(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white" />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Target Accounts (comma-separated, optional)</label>
              <input value={configTargets} onChange={e => setConfigTargets(e.target.value)} placeholder="@OpenAI, @AnthropicAI, ..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white placeholder-zinc-600" />
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={configTestMode} onChange={e => setConfigTestMode(e.target.checked)}
                  className="rounded bg-zinc-800 border-zinc-600" />
                <span className="text-sm text-zinc-400">Test Mode (log only, no real actions)</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">Add TikTok Account</h3>
              <button onClick={() => { setShowAdd(false); setPreview(null); }} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Account Name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="My TikTok"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600" />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1 flex items-center justify-between">
                  Cookies
                  <button onClick={() => setShowCookies(!showCookies)} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
                    {showCookies ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showCookies ? 'Hide' : 'Show'}
                  </button>
                </label>
                <textarea value={newCookies} onChange={e => { setNewCookies(e.target.value); setPreview(null); }}
                  placeholder='Paste cookies from Cookie Editor extension (JSON) or as "name=value; name2=value2"'
                  rows={4} style={showCookies ? {} : { WebkitTextSecurity: 'disc' } as React.CSSProperties}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 font-mono" />
                <p className="text-xs text-zinc-500 mt-1">Required: <code className="text-pink-400">sessionid</code>. Recommended: tt_webid, msToken</p>
              </div>

              {newCookies.trim() && (
                <button onClick={previewCookies} disabled={previewLoading}
                  className="text-xs text-zinc-400 hover:text-white flex items-center gap-1">
                  {previewLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                  Preview cookies
                </button>
              )}

              {preview && (
                <div className={`p-3 rounded-lg border text-sm ${preview.valid ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {preview.valid ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                    <span className={preview.valid ? 'text-green-400' : 'text-red-400'}>
                      {preview.valid ? 'Valid' : 'Invalid'} — {preview.cookieCount} cookies ({preview.format})
                    </span>
                  </div>
                  {preview.missing.length > 0 && <div className="text-red-400 text-xs">Missing: {preview.missing.join(', ')}</div>}
                  {preview.warnings.map((w, i) => <div key={i} className="text-yellow-400 text-xs mt-1">{w}</div>)}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => { setShowAdd(false); setPreview(null); }} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
                <button onClick={addAccount} disabled={addLoading || !newName.trim() || !newCookies.trim()}
                  className="px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
                  {addLoading ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : <Plus className="w-4 h-4 inline mr-1" />}
                  Add Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
