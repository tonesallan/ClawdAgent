import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Activity, Cpu, DollarSign, Clock, Bot, TrendingUp, MessageSquare,
  Search, Zap, RefreshCw, Server, ArrowRight, Waves, Flame,
  ShieldCheck, Check, X, Hash, Smartphone,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────
interface DashboardApproval {
  id: string;
  agentId?: string;
  action?: string;
  description?: string;
  riskCategory?: string;
  riskScore?: number;
  estimatedCost?: number;
  createdAt?: number;
  expiresAt?: number;
  status?: string;
  source?: string;
  persistent?: boolean;
  accountKey?: string;
  tiktokActionId?: string;
  provider?: string;
  payload?: {
    query?: string;
    source?: string;
    discoveredAt?: string;
    candidate?: {
      source?: string;
      text?: string | null;
      contentDescription?: string | null;
      username?: string | null;
      authorUsername?: string | null;
      author?: string | null;
      hashtags?: string[];
      resourceId?: string | null;
      bounds?: string | null;
    };
  };
}

interface DashboardApprovalsResponse {
  pending: DashboardApproval[];
  stats: {
    pending: number;
    approvedToday: number;
    deniedToday: number;
  };
}

interface DashboardData {
  status: any;
  costs: any;
  cron: any[];
  activity: any[];
  heatmap: number[][];
  kanban: Record<string, any[]>;
  approvals: DashboardApprovalsResponse;
}

// ── Animated Counter Hook ──────────────────────────────────────────
function useAnimatedValue(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    const start = ref.current;
    const diff = target - start;
    if (Math.abs(diff) < 0.001) { setValue(target); ref.current = target; return; }
    const startTime = performance.now();
    let frameId: number;

    const animate = (now: number) => {
      const elapsed = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3); // ease-out cubic
      const current = start + diff * eased;
      setValue(current);
      if (elapsed < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        ref.current = target;
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [target, duration]);

  return value;
}

// ── Skeleton Components ────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="card-gradient rounded-xl p-5 transition-all">
      <div className="skeleton h-4 w-20 mb-3" />
      <div className="skeleton h-8 w-28 mb-2" />
      <div className="skeleton h-3 w-16" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="card-gradient rounded-xl p-5">
      <div className="skeleton h-5 w-40 mb-4" />
      <div className="skeleton h-48 w-full" />
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, gradient, glow, suffix, pulse }: {
  label: string;
  value: string | number;
  icon: any;
  gradient: string;
  glow: string;
  suffix?: string;
  pulse?: boolean;
}) {
  const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;
  const animated = useAnimatedValue(numValue);
  const isNumber = typeof value === 'number' || (typeof value === 'string' && !isNaN(parseFloat(value)) && value !== 'Online' && value !== 'Offline' && !value.includes('h') && !value.includes('m') && !value.includes('d'));

  return (
    <div className={`card-gradient rounded-xl p-5 transition-all duration-300 hover:scale-[1.02] ${glow}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${gradient}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        {pulse && <span className="inline-block w-2 h-2 bg-green-400 rounded-full mr-1.5 pulse-dot" />}
        <span className={`text-2xl font-bold tracking-tight animate-counter ${pulse ? 'text-green-400' : 'text-white'}`}>
          {isNumber ? (numValue % 1 !== 0 ? animated.toFixed(4) : Math.round(animated)) : value}
        </span>
        {suffix && <span className="text-xs text-gray-500">{suffix}</span>}
      </div>
    </div>
  );
}

// ── Generate chart data ────────────────────────────────────────────
function generateTokenData() {
  const data = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const h = new Date(now.getTime() - i * 3600_000);
    data.push({
      hour: h.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false }),
      tokens: i > 18 || i < 6 ? Math.floor(Math.random() * 500) : Math.floor(Math.random() * 5000 + 1000),
    });
  }
  return data;
}

function generateCostData() {
  const data = [];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000);
    data.push({
      day: days[d.getDay()],
      cost: +(Math.random() * 2 + 0.1).toFixed(3),
    });
  }
  return data;
}

// ── Custom Tooltip ─────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, valueKey, prefix }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-850 border border-gray-700/50 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-[11px] text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-white">
        {prefix}{typeof payload[0].value === 'number' && payload[0].value % 1 !== 0 ? payload[0].value.toFixed(4) : payload[0].value?.toLocaleString()}
        {valueKey === 'tokens' && ' tokens'}
      </p>
    </div>
  );
}

// ── Activity Heatmap (GitHub-style) ────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HEAT_COLORS = [
  'bg-dark-800',                           // 0
  'bg-emerald-900/60',                     // low
  'bg-emerald-700/70',                     // medium-low
  'bg-emerald-500/80',                     // medium
  'bg-emerald-400',                        // high
];

function getHeatLevel(value: number, max: number): number {
  if (value === 0 || max === 0) return 0;
  const ratio = value / max;
  if (ratio < 0.15) return 1;
  if (ratio < 0.4) return 2;
  if (ratio < 0.7) return 3;
  return 4;
}

function ActivityHeatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(...grid.flat(), 1);
  const total = grid.flat().reduce((a, b) => a + b, 0);
  const [tooltip, setTooltip] = useState<{ day: number; hour: number; x: number; y: number } | null>(null);

  return (
    <div className="card-gradient rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-400" /> Activity Heatmap
        </h2>
        <span className="text-[10px] text-gray-500 font-mono">{total.toLocaleString()} actions · 4 weeks</span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Hour labels */}
          <div className="flex mb-1 ml-10">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 text-center text-[9px] text-gray-600 font-mono">
                {h % 3 === 0 ? `${String(h).padStart(2, '0')}` : ''}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {DAYS.map((day, di) => (
            <div key={day} className="flex items-center gap-1 mb-[3px]">
              <span className="text-[10px] text-gray-500 w-8 text-right font-mono shrink-0">{day}</span>
              <div className="flex flex-1 gap-[2px]">
                {Array.from({ length: 24 }, (_, hi) => {
                  const val = grid[di]?.[hi] ?? 0;
                  const level = getHeatLevel(val, max);
                  return (
                    <div
                      key={hi}
                      className={`flex-1 aspect-square rounded-[3px] ${HEAT_COLORS[level]} transition-colors duration-200 hover:ring-1 hover:ring-white/30 cursor-default`}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({ day: di, hour: hi, x: rect.left + rect.width / 2, y: rect.top });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500">Less</span>
          {HEAT_COLORS.map((c, i) => (
            <div key={i} className={`w-3 h-3 rounded-[2px] ${c}`} />
          ))}
          <span className="text-[10px] text-gray-500">More</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-dark-850 border border-gray-700/50 rounded-lg px-3 py-2 shadow-xl pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y - 40, transform: 'translateX(-50%)' }}
        >
          <p className="text-[11px] text-gray-400">{DAYS[tooltip.day]} {String(tooltip.hour).padStart(2, '0')}:00</p>
          <p className="text-sm font-semibold text-white">{(grid[tooltip.day]?.[tooltip.hour] ?? 0).toLocaleString()} actions</p>
        </div>
      )}
    </div>
  );
}

// ── Kanban Task Board ─────────────────────────────────────────────
const KANBAN_COLS: Array<{ key: string; label: string; color: string; dot: string }> = [
  { key: 'pending', label: 'Pending', color: 'text-amber-400', dot: 'bg-amber-400' },
  { key: 'in-progress', label: 'In Progress', color: 'text-blue-400', dot: 'bg-blue-400' },
  { key: 'done', label: 'Done', color: 'text-green-400', dot: 'bg-green-400' },
];

const PRIORITY_BADGE: Record<string, string> = {
  p0: 'bg-red-500/20 text-red-400',
  p1: 'bg-orange-500/20 text-orange-400',
  p2: 'bg-yellow-500/20 text-yellow-400',
  p3: 'bg-gray-700 text-gray-400',
};

function KanbanBoard({ columns }: { columns: Record<string, any[]> }) {
  return (
    <div className="card-gradient rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" /> Task Board
        </h2>
        <span className="text-[10px] text-gray-500 font-mono">
          {Object.values(columns).reduce((s, c) => s + c.length, 0)} tasks
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {KANBAN_COLS.map(col => {
          const items = columns[col.key] ?? [];
          return (
            <div key={col.key} className="min-h-[120px]">
              <div className="flex items-center gap-2 mb-2.5">
                <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                <span className={`text-xs font-semibold ${col.color}`}>{col.label}</span>
                <span className="text-[10px] text-gray-600 ml-auto">{items.length}</span>
              </div>
              <div className="space-y-1.5">
                {items.length === 0 ? (
                  <div className="text-[10px] text-gray-700 text-center py-4">No tasks</div>
                ) : (
                  items.slice(0, 5).map((task: any) => (
                    <div key={task.id} className="bg-dark-800/80 border border-gray-800/50 rounded-lg px-3 py-2 hover:border-gray-700 transition-colors">
                      <p className="text-xs text-gray-200 truncate">{task.title}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        {task.priority && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_BADGE[task.priority] ?? PRIORITY_BADGE.p3}`}>
                            {task.priority.toUpperCase()}
                          </span>
                        )}
                        {task.tags && Array.isArray(task.tags) && task.tags.slice(0, 2).map((tag: string) => (
                          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-dark-900 text-gray-500">{tag}</span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
                {items.length > 5 && (
                  <p className="text-[10px] text-gray-600 text-center">+{items.length - 5} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Agents data ────────────────────────────────────────────────────
function formatReviewTime(
  timestamp?: number,
): string {

  if (!timestamp) {
    return '--';
  }

  const date =
    new Date(
      timestamp,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '--';
  }

  return date.toLocaleString(
    undefined,
    {
      dateStyle:
        'short',

      timeStyle:
        'short',
    },
  );
}

function ApprovalReviewQueue({
  approvals,
  busyId,
  error,
  onDecision,
}: {
  approvals: DashboardApprovalsResponse;
  busyId: string | null;
  error: string | null;
  onDecision: (
    id: string,
    decision: 'approve' | 'deny',
  ) => Promise<void>;
}) {

  const pending =
    approvals.pending ??
    [];

  return (
    <div className="card-gradient rounded-xl p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            Human Review Queue
          </h2>

          <p className="text-[10px] text-gray-500 mt-1">
            TikTok approval records a human decision only. It does not execute engagement.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className="px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
            {approvals.stats?.pending ?? 0} pending
          </span>

          <span className="px-2 py-1 rounded-md bg-green-500/10 text-green-400 border border-green-500/20">
            {approvals.stats?.approvedToday ?? 0} approved today
          </span>

          <span className="px-2 py-1 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
            {approvals.stats?.deniedToday ?? 0} denied today
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-300">
          {error}
        </div>
      )}

      {pending.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-gray-800 rounded-xl">
          <ShieldCheck className="w-8 h-8 mx-auto text-gray-700 mb-2" />

          <p className="text-xs text-gray-500">
            No items waiting for review
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map(
            approval => {

              const isTikTok =
                approval.source ===
                  'tiktok' ||
                approval.action ===
                  'DISCOVERY_REVIEW';

              const candidate =
                approval.payload?.candidate;

              const hashtags =
                Array.isArray(
                  candidate?.hashtags,
                )
                  ? candidate.hashtags
                  : [];

              const username =
                candidate?.username ??
                candidate?.authorUsername ??
                candidate?.author ??
                null;

              const candidateText =
                candidate?.text ??
                candidate?.contentDescription ??
                null;

              const isBusy =
                busyId ===
                approval.id;

              return (
                <div
                  key={approval.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    isTikTok
                      ? 'border-pink-500/20 bg-pink-500/[0.035]'
                      : 'border-gray-800 bg-dark-800/50'
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">

                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {isTikTok ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-pink-500/10 text-pink-300 border border-pink-500/20">
                            <Smartphone className="w-3 h-3" />
                            TikTok Discovery
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20">
                            System Approval
                          </span>
                        )}

                        {approval.persistent && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            persistent
                          </span>
                        )}

                        {approval.provider && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] bg-gray-800 text-gray-400 border border-gray-700">
                            {approval.provider}
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-gray-200 break-words">
                        {approval.description ??
                          approval.action ??
                          'Approval request'}
                      </p>

                      {isTikTok && (
                        <div className="mt-3 space-y-2">

                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500">
                            {approval.payload?.query && (
                              <span>
                                Query:{' '}
                                <span className="text-gray-300 font-mono">
                                  {approval.payload.query}
                                </span>
                              </span>
                            )}

                            {approval.accountKey && (
                              <span>
                                Account:{' '}
                                <span className="text-gray-300 font-mono">
                                  {approval.accountKey}
                                </span>
                              </span>
                            )}

                            {username && (
                              <span>
                                User:{' '}
                                <span className="text-gray-300 font-mono">
                                  @{String(username).replace(/^@/, '')}
                                </span>
                              </span>
                            )}
                          </div>

                          {hashtags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {hashtags.map(
                                hashtag => (
                                  <span
                                    key={hashtag}
                                    className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[10px]"
                                  >
                                    <Hash className="w-2.5 h-2.5" />
                                    {String(hashtag).replace(/^#/, '')}
                                  </span>
                                ),
                              )}
                            </div>
                          )}

                          {candidateText && (
                            <div className="rounded-lg bg-dark-900/70 border border-gray-800 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-wide text-gray-600 mb-1">
                                Visible candidate text
                              </p>

                              <p className="text-xs text-gray-400 whitespace-pre-wrap break-words">
                                {candidateText}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3 mt-3 text-[9px] text-gray-600">
                        <span>
                          Created {formatReviewTime(approval.createdAt)}
                        </span>

                        {approval.agentId && (
                          <span className="font-mono">
                            {approval.agentId}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          onDecision(
                            approval.id,
                            'deny',
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {isBusy ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}

                        Reject
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          onDecision(
                            approval.id,
                            'approve',
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {isBusy ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}

                        Approve
                      </button>
                    </div>
                  </div>
                </div>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
const AGENTS = [
  { id: 'orchestrator', name: 'Orchestrator', status: 'active', color: 'bg-blue-500' },
  { id: 'code-assistant', name: 'Code Assistant', status: 'idle', color: 'bg-purple-500' },
  { id: 'researcher', name: 'Researcher', status: 'idle', color: 'bg-cyan-500' },
  { id: 'server-manager', name: 'Server Manager', status: 'idle', color: 'bg-orange-500' },
  { id: 'task-planner', name: 'Task Planner', status: 'idle', color: 'bg-green-500' },
  { id: 'general', name: 'General', status: 'active', color: 'bg-pink-500' },
];

// ── Main Dashboard ─────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approvalBusyId, setApprovalBusyId] =
    useState<string | null>(null);
  const [approvalError, setApprovalError] =
    useState<string | null>(null);
  const [tokenData] = useState(generateTokenData);
  const [costData] = useState(generateCostData);
  const navigate = useNavigate();

  const loadDashboard = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const [
        status,
        costs,
        cron,
        activity,
        heatmapRes,
        kanbanRes,
        approvalsRes,
      ] = await Promise.all([
        api.dashboardStatus().catch(() => null),
        api.dashboardCosts().catch(() => ({ totalCost: 0, totalCalls: 0, byModel: {} })),
        api.dashboardCron().catch(() => []),
        api.dashboardActivity().catch(() => []),
        api.dashboardHeatmap().catch(() => ({ grid: Array.from({ length: 7 }, () => Array(24).fill(0)) })),
        api.dashboardKanban().catch(() => ({ columns: { pending: [], 'in-progress': [], done: [] } })),
        api.dashboardApprovals().catch(() => ({
          pending: [],
          stats: {
            pending: 0,
            approvedToday: 0,
            deniedToday: 0,
          },
        })),
      ]);

      setData({
        status,
        costs,
        cron,
        activity,
        heatmap: heatmapRes.grid,
        kanban: kanbanRes.columns,
        approvals: approvalsRes,
      });
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(() => loadDashboard(), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    document.title = 'ClawdAgent | Dashboard';
  }, []);

  const handleApprovalDecision = async (
    id: string,
    decision: 'approve' | 'deny',
  ) => {

    if (approvalBusyId) {
      return;
    }

    setApprovalBusyId(
      id,
    );

    setApprovalError(
      null,
    );

    try {

      const result =
        decision === 'approve'
          ? await api.approveAction(id)
          : await api.denyAction(id);

      if (!result?.ok) {
        throw new Error(
          `Review could not be ${decision === 'approve' ? 'approved' : 'rejected'}.`,
        );
      }

      const approvals =
        await api.dashboardApprovals();

      setData(
        current => {

          if (!current) {
            return current;
          }

          return {
            ...current,
            approvals,
          };
        },
      );
    }
    catch (error) {

      setApprovalError(
        error instanceof Error
          ? error.message
          : 'Failed to resolve review.',
      );
    }
    finally {

      setApprovalBusyId(
        null,
      );
    }
  };

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <div className="skeleton h-8 w-48 mb-6" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            {[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        </div>
      </div>
    );
  }

  const status = data?.status;
  const costs = data?.costs;
  const cronCount = data?.cron?.length ?? 0;
  const activity = data?.activity ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-7xl mx-auto animate-fade-in">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-600/20">
              <Waves className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
              <p className="text-[11px] text-gray-500">Real-time system overview</p>
            </div>
          </div>
          <button
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-dark-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* ── Stat Cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <StatCard
            label="Status"
            value={status?.status === 'online' ? 'Online' : 'Offline'}
            icon={Activity}
            gradient="from-green-500 to-emerald-600"
            glow="hover:glow-green"
            pulse={status?.status === 'online'}
          />
          <StatCard
            label="Uptime"
            value={status?.uptime ? formatUptime(status.uptime) : '--'}
            icon={Clock}
            gradient="from-blue-500 to-blue-600"
            glow="hover:glow-blue"
          />
          <StatCard
            label="Memory"
            value={status?.memory?.heapUsed ? `${status.memory.heapUsed}` : '--'}
            icon={Cpu}
            gradient="from-purple-500 to-purple-600"
            glow="hover:glow-purple"
            suffix="MB"
          />
          <StatCard
            label="Today Cost"
            value={costs?.totalCost != null ? costs.totalCost.toFixed(4) : '0.00'}
            icon={DollarSign}
            gradient="from-amber-500 to-orange-600"
            glow="hover:glow-amber"
            suffix="$"
          />
          <StatCard
            label="API Calls"
            value={costs?.totalCalls ?? 0}
            icon={TrendingUp}
            gradient="from-cyan-500 to-cyan-600"
            glow="hover:glow-blue"
          />
          <StatCard
            label="Cron Tasks"
            value={cronCount}
            icon={Zap}
            gradient="from-orange-500 to-red-600"
            glow="hover:glow-amber"
          />
        </div>

        {/* ── Charts Row ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Token Usage Chart */}
          <div className="card-gradient rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-200">Token Usage (24h)</h2>
              <span className="text-[10px] text-gray-500 font-mono">
                {tokenData.reduce((a: number, d: any) => a + d.tokens, 0).toLocaleString()} total
              </span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={tokenData}>
                <defs>
                  <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.3)" />
                <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
                <Tooltip content={<ChartTooltip valueKey="tokens" />} />
                <Area type="monotone" dataKey="tokens" stroke="#3b82f6" strokeWidth={2} fill="url(#tokenGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Costs Chart */}
          <div className="card-gradient rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-200">Costs (7 days)</h2>
              <span className="text-[10px] text-gray-500 font-mono">
                ${costData.reduce((a: number, d: any) => a + d.cost, 0).toFixed(2)} total
              </span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={costData}>
                <defs>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.3)" />
                <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `$${v}`} />
                <Tooltip content={<ChartTooltip prefix="$" />} />
                <Bar dataKey="cost" fill="url(#costGrad)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Activity Heatmap ─────────────────────────────────── */}
        {data?.heatmap && (
          <div className="mb-6">
            <ActivityHeatmap grid={data.heatmap} />
          </div>
        )}

        {/* ── Kanban Task Board ───────────────────────────────── */}
        {data?.kanban && (
          <div className="mb-6">
            <KanbanBoard columns={data.kanban} />
          </div>
        )}

        {data?.approvals && (
          <div className="mb-6">
            <ApprovalReviewQueue
              approvals={data.approvals}
              busyId={approvalBusyId}
              error={approvalError}
              onDecision={handleApprovalDecision}
            />
          </div>
        )}

        {/* ── Bottom Widgets ──────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          {/* Active Agents */}
          <div className="card-gradient rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary-400" /> Active Agents
              </h2>
              <button onClick={() => navigate('/agents')} className="text-[10px] text-primary-400 hover:text-primary-300 flex items-center gap-0.5">
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {AGENTS.map(agent => (
                <div key={agent.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2 h-2 rounded-full ${agent.status === 'active' ? 'bg-green-400 pulse-dot' : 'bg-gray-600'}`} />
                    <span className="text-xs text-gray-300">{agent.name}</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    agent.status === 'active'
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-gray-800 text-gray-500'
                  }`}>
                    {agent.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Server Health */}
          <div className="card-gradient rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                <Server className="w-4 h-4 text-purple-400" /> System Health
              </h2>
            </div>
            <div className="space-y-4">
              <HealthBar label="CPU" value={status?.system?.cpuPercent ?? 0} color="from-blue-500 to-cyan-400" />
              <HealthBar label="RAM" value={status?.system?.memPercent ?? 0} color="from-purple-500 to-pink-400" />
              <HealthBar label="Heap" value={status?.memory ? Math.round((status.memory.heapUsed / status.memory.heapTotal) * 100) : 0} color="from-amber-500 to-orange-400" />
              <div className="pt-2 border-t border-gray-800/50 text-[11px] text-gray-500 space-y-1">
                <div className="flex justify-between">
                  <span>Host</span>
                  <span className="font-mono text-gray-400">{status?.system?.hostname ?? '--'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Platform</span>
                  <span className="font-mono text-gray-400">{status?.system?.platform ?? '--'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card-gradient rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-cyan-400" /> Recent Activity
              </h2>
            </div>
            <div className="space-y-2.5">
              {activity.length === 0 ? (
                <div className="text-center py-6 text-gray-600">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Send a message to see activity</p>
                </div>
              ) : (
                activity.slice(0, 6).map((item: any, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 py-1">
                    <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                      item.type === 'error' ? 'bg-red-400' :
                      item.type === 'response' ? 'bg-green-400' : 'bg-blue-400'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-300 truncate">{item.message}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-600">
                          {new Date(item.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                        {item.platform && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-dark-800 text-gray-500">{item.platform}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Quick Actions ──────────────────────────────────── */}
        <div className="card-gradient rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-200 mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            <QuickAction label="Chat" icon={MessageSquare} onClick={() => navigate('/')} />
            <QuickAction label="Search" icon={Search} onClick={() => navigate('/')} />
            <QuickAction label="Agents" icon={Bot} onClick={() => navigate('/agents')} />
            <QuickAction label="Costs" icon={DollarSign} onClick={() => navigate('/costs')} />
            <QuickAction label="Settings" icon={Zap} onClick={() => navigate('/settings')} />
          </div>
        </div>

        {/* ── Model Usage Table ───────────────────────────────── */}
        {costs?.byModel && Object.keys(costs.byModel).length > 0 && (
          <div className="card-gradient rounded-xl p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
              <Bot className="w-4 h-4 text-gray-400" /> Model Usage Today
            </h2>
            <div className="divide-y divide-gray-800/50">
              {Object.entries(costs.byModel).map(([model, d]: [string, any]) => (
                <div key={model} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-xs font-medium text-gray-200">{model}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{d.calls ?? 0} calls</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono text-amber-400">${(d.cost ?? 0).toFixed(4)}</p>
                    <p className="text-[10px] text-gray-500">
                      {(d.inputTokens ?? 0).toLocaleString()} in / {(d.outputTokens ?? 0).toLocaleString()} out
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Health Bar Component ───────────────────────────────────────────
function HealthBar({ label, value, color }: { label: string; value: number; color: string }) {
  const clamped = Math.min(Math.max(value, 0), 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs font-mono text-gray-300">{clamped}%</span>
      </div>
      <div className="h-2 bg-dark-850 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700 ease-out`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

// ── Quick Action Button ────────────────────────────────────────────
function QuickAction({ label, icon: Icon, onClick }: { label: string; icon: any; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800/60 border border-gray-800/50 text-sm text-gray-300 hover:text-white hover:border-primary-500/30 hover:bg-dark-800 transition-all duration-200 hover:shadow-lg hover:shadow-primary-500/5"
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ── Format uptime ──────────────────────────────────────────────────
function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
