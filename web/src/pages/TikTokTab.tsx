import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  Smartphone,
  Square,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';

import {
  useAuthStore,
} from '../stores/auth';

interface MobileConnection {
  connected: boolean;
  url: string;
  error?: string;
}

interface MobileDevice {
  id: string;
  status: string;
  model: string;
  device: string;
  product: string;
}

interface MobileAgentStats {
  likes: number;
  comments: number;
  follows: number;
  scrolls: number;
  shares: number;
  errors: number;
  totalActions: number;
  actionsThisHour: number;
  lastActionAt: string | null;
}

interface MobileAgentStatus {
  id: string;
  app: string;
  deviceId: string;
  state:
    | 'stopped'
    | 'running'
    | 'paused'
    | 'error';
  currentAction: string | null;
  stats: MobileAgentStats;
  lastError: string | null;
  startedAt: string | null;
  lastAction: string | null;
  lastActionTime: string | null;
  nextActionTime: string | null;
  config: {
    testMode?: boolean;
  };
}

interface MobileAgentLog {
  timestamp: string;
  action: string;
  status:
    | 'success'
    | 'error'
    | 'skipped'
    | 'info';
  message: string;
  details?: string;
}

interface TikTokRuntimeStatus {
  state:
    | 'stopped'
    | 'running'
    | 'paused';
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
  providers: Array<{
    name:
      | 'android'
      | 'web'
      | 'dry-run';
    label: string;
    mode: string;
  }>;
  registeredProviders: string[];
  mobileProvider: {
    registered: boolean;
    active: boolean;
    agentCount: number;
    activeAgentCount: number;
    mode: 'android-appium';
  };
  mobileAgents: MobileAgentStatus[];
  runtime: TikTokRuntimeStatus;
}

interface RelationshipObservationResult {
  provider: string;
  targetKey: string;
  relationship: string;
  observedAt: string;
  details?: {
    readOnly?: boolean;
    source?: string;
    navigationPerformed?: boolean;
    username?: string;
    deviceId?: string;
  };
}

interface TikTokManualReviewItem {
  id: string;
  kind:
    | 'discovery'
    | 'unfollow';
  accountKey: string;
  provider: string;
  targetKey: string | null;
  username: string | null;
  displayName: string | null;
  reason: string | null;
  query: string | null;
  hashtags: string[];
  createdAt: string;
}

interface TikTokManualReviewResponse {
  reviews:
    TikTokManualReviewItem[];
  counts: {
    total: number;
    discovery: number;
    unfollow: number;
  };
}

interface TikTokCoreOverview {
  actions: {
    total: number;
    byStatus:
      Array<{
        key: string;
        count: number;
      }>;
    byType:
      Array<{
        key: string;
        count: number;
      }>;
    byProvider:
      Array<{
        key: string;
        count: number;
      }>;
  };
  relationships: {
    total: number;
    protectedCount: number;
    processedCount: number;
    byState:
      Array<{
        key: string;
        count: number;
      }>;
  };
  history:
    Array<{
      id: string;
      actionId: string;
      accountKey: string | null;
      actionType: string | null;
      targetUsername: string | null;
      targetDisplayName: string | null;
      status: string;
      provider: string | null;
      error: string | null;
      event: unknown;
      createdAt: string;
    }>;
  recentRelationships:
    Array<{
      id: string;
      accountKey: string;
      targetKey: string;
      username: string | null;
      displayName: string | null;
      relationshipState: string;
      followsUs: boolean | null;
      followedByUs: boolean;
      followedByUsAt: string | null;
      followBackCheckAt: string | null;
      lastCheckedAt: string | null;
      protected: boolean;
      processed: boolean;
      updatedAt: string;
    }>;
}

const ACTION_OPTIONS = [
  'like',
  'comment',
  'follow',
  'share',
  'scroll',
];

export default function TikTokTab() {
  const {
    token,
  } = useAuthStore();

  const headers = {
    Authorization:
      `Bearer ${token}`,
    'Content-Type':
      'application/json',
  };

  const [
    error,
    setError,
  ] = useState('');

  const [
    connection,
    setConnection,
  ] = useState<
    MobileConnection |
    null
  >(null);

  const [
    devices,
    setDevices,
  ] = useState<
    MobileDevice[]
  >([]);

  const [
    mobileAgents,
    setMobileAgents,
  ] = useState<
    MobileAgentStatus[]
  >([]);

  const [
    selectedDevice,
    setSelectedDevice,
  ] = useState('');

  const [
    selectedAgentId,
    setSelectedAgentId,
  ] = useState('');

  const [
    appiumUrl,
    setAppiumUrl,
  ] = useState(
    'http://localhost:4723',
  );

  const [
    agentLoading,
    setAgentLoading,
  ] = useState(
    false,
  );

  const [
    agentActions,
    setAgentActions,
  ] = useState<
    string[]
  >([
    'like',
    'comment',
    'follow',
    'scroll',
  ]);

  const [
    agentTestMode,
    setAgentTestMode,
  ] = useState(
    true,
  );

  const [
    minDelaySeconds,
    setMinDelaySeconds,
  ] = useState(
    180,
  );

  const [
    maxActionsPerHour,
    setMaxActionsPerHour,
  ] = useState(
    5,
  );

  const [
    agentLogs,
    setAgentLogs,
  ] = useState<
    MobileAgentLog[]
  >([]);

  const [
    providerStatus,
    setProviderStatus,
  ] = useState<
    TikTokProviderStatus |
    null
  >(null);

  const [
    runtimeLoading,
    setRuntimeLoading,
  ] = useState(
    false,
  );

  const [
    relationshipUsername,
    setRelationshipUsername,
  ] = useState('');

  const [
    relationshipObservation,
    setRelationshipObservation,
  ] = useState<
    RelationshipObservationResult |
    null
  >(null);

  const [
    relationshipChecking,
    setRelationshipChecking,
  ] = useState(
    false,
  );

  const [
    coreOverview,
    setCoreOverview,
  ] = useState<
    TikTokCoreOverview |
    null
  >(null);

  const [
    manualReviews,
    setManualReviews,
  ] = useState<
    TikTokManualReviewResponse |
    null
  >(null);

  const [
    reviewLoadingId,
    setReviewLoadingId,
  ] = useState<
    string |
    null
  >(null);

  const fetchConnection =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              '/api/mobile-agent/connection',
              {
                headers,
              },
            );

          if (!response.ok) {
            return;
          }

          const data =
            await response.json();

          setConnection(
            data,
          );

          if (
            data.url
          ) {
            setAppiumUrl(
              data.url,
            );
          }
        }
        catch {
          setConnection(
            null,
          );
        }
      },
      [
        token,
      ],
    );

  const fetchDevices =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              '/api/mobile-agent/devices',
              {
                headers,
              },
            );

          if (!response.ok) {
            return;
          }

          const data =
            await response.json();

          const nextDevices =
            data.devices ??
            [];

          setDevices(
            nextDevices,
          );

          if (
            !selectedDevice &&
            nextDevices.length >
              0
          ) {
            setSelectedDevice(
              nextDevices[0].id,
            );
          }
        }
        catch {
          // Keep previous device state.
        }
      },
      [
        token,
        selectedDevice,
      ],
    );

  const fetchAgents =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              '/api/mobile-agent/agents',
              {
                headers,
              },
            );

          if (!response.ok) {
            return;
          }

          const data =
            await response.json();

          const tiktokAgents:
            MobileAgentStatus[] =
              (
                data.agents ??
                []
              )
                .filter(
                  (
                    agent:
                      MobileAgentStatus,
                  ) =>
                    agent.app ===
                    'tiktok',
                );

          setMobileAgents(
            tiktokAgents,
          );

          if (
            tiktokAgents.length >
              0 &&
            !tiktokAgents.some(
              agent =>
                agent.id ===
                selectedAgentId,
            )
          ) {
            setSelectedAgentId(
              tiktokAgents[0]
                .id,
            );
          }
        }
        catch {
          // Keep previous state.
        }
      },
      [
        token,
        selectedAgentId,
      ],
    );

  const fetchProviderStatus =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              '/api/tiktok/provider-status',
              {
                headers,
              },
            );

          if (!response.ok) {
            return;
          }

          setProviderStatus(
            await response
              .json(),
          );
        }
        catch {
          // Keep previous state.
        }
      },
      [
        token,
      ],
    );

  const fetchCoreOverview =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              '/api/tiktok/core/overview?limit=50',
              {
                headers,
              },
            );

          if (!response.ok) {
            return;
          }

          setCoreOverview(
            await response
              .json(),
          );
        }
        catch {
          // Keep previous state.
        }
      },
      [
        token,
      ],
    );

  const fetchManualReviews =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              '/api/tiktok/reviews',
              {
                headers,
              },
            );

          if (!response.ok) {
            return;
          }

          setManualReviews(
            await response
              .json(),
          );
        }
        catch {
          // Keep previous state.
        }
      },
      [
        token,
      ],
    );

  const fetchAgentLogs =
    useCallback(
      async (
        agentId:
          string,
      ) => {
        if (!agentId) {
          setAgentLogs(
            [],
          );
          return;
        }

        try {
          const response =
            await fetch(
              `/api/mobile-agent/agents/${encodeURIComponent(agentId)}/logs?limit=100`,
              {
                headers,
              },
            );

          if (!response.ok) {
            return;
          }

          const data =
            await response
              .json();

          setAgentLogs(
            data.logs ??
            [],
          );
        }
        catch {
          // Keep previous logs.
        }
      },
      [
        token,
      ],
    );

  const refreshAll =
    useCallback(
      async () => {
        await Promise.all([
          fetchConnection(),
          fetchDevices(),
          fetchAgents(),
          fetchProviderStatus(),
          fetchCoreOverview(),
          fetchManualReviews(),
        ]);
      },
      [
        fetchConnection,
        fetchDevices,
        fetchAgents,
        fetchProviderStatus,
        fetchCoreOverview,
        fetchManualReviews,
      ],
    );

  useEffect(
    () => {
      void refreshAll();
    },
    [
      refreshAll,
    ],
  );

  useEffect(
    () => {
      if (
        selectedAgentId
      ) {
        void fetchAgentLogs(
          selectedAgentId,
        );
      }
    },
    [
      selectedAgentId,
      fetchAgentLogs,
    ],
  );

  useEffect(
    () => {
      const interval =
        setInterval(
          () => {
            void Promise.all([
              fetchAgents(),
              fetchProviderStatus(),
              fetchCoreOverview(),
              fetchManualReviews(),
            ]);

            if (
              selectedAgentId
            ) {
              void fetchAgentLogs(
                selectedAgentId,
              );
            }
          },
          5000,
        );

      return () =>
        clearInterval(
          interval,
        );
    },
    [
      fetchAgents,
      fetchProviderStatus,
      fetchCoreOverview,
      fetchManualReviews,
      fetchAgentLogs,
      selectedAgentId,
    ],
  );

  const activeAgent =
    mobileAgents.find(
      agent =>
        agent.id ===
        selectedAgentId,
    ) ??
    mobileAgents[0] ??
    null;

  const startMobileAgent =
    async () => {
      setAgentLoading(
        true,
      );

      setError(
        '',
      );

      try {
        const response =
          await fetch(
            '/api/mobile-agent/agents',
            {
              method:
                'POST',
              headers,
              body:
                JSON.stringify({
                  app:
                    'tiktok',
                  deviceId:
                    selectedDevice ||
                    undefined,
                  appiumUrl,
                  config: {
                    actions:
                      agentActions,
                    testMode:
                      agentTestMode,
                    safety: {
                      minDelaySeconds,
                      maxActionsPerHour,
                      pauseOnErrorCount:
                        2,
                      pauseDurationMinutes:
                        120,
                    },
                    content: {
                      tone:
                        'Authentic, friendly, engaged',
                      language:
                        'pt-BR',
                      topics: [
                        'AI',
                        'technology',
                      ],
                      maxLength:
                        150,
                    },
                  },
                }),
            },
          );

        const data =
          await response
            .json();

        if (!response.ok) {
          setError(
            data.error ??
            'Failed to start Android TikTok agent',
          );
          return;
        }

        setSelectedAgentId(
          data.status.id,
        );

        await Promise.all([
          fetchAgents(),
          fetchProviderStatus(),
        ]);
      }
      catch (
        err:
          unknown
      ) {
        setError(
          err instanceof Error
            ? err.message
            : String(
                err,
              ),
        );
      }
      finally {
        setAgentLoading(
          false,
        );
      }
    };

  const controlMobileAgent =
    async (
      action:
        'pause'
        | 'resume'
        | 'stop',
      agentId:
        string,
    ) => {
      setAgentLoading(
        true,
      );

      setError(
        '',
      );

      try {
        const response =
          await fetch(
            `/api/mobile-agent/agents/${encodeURIComponent(agentId)}/${action}`,
            {
              method:
                'POST',
              headers,
            },
          );

        const data =
          await response
            .json();

        if (!response.ok) {
          setError(
            data.error ??
            `Failed to ${action} mobile agent`,
          );
          return;
        }

        if (
          action ===
          'stop'
        ) {
          setSelectedAgentId(
            '',
          );
          setAgentLogs(
            [],
          );
        }

        await Promise.all([
          fetchAgents(),
          fetchProviderStatus(),
        ]);
      }
      catch (
        err:
          unknown
      ) {
        setError(
          err instanceof Error
            ? err.message
            : String(
                err,
              ),
        );
      }
      finally {
        setAgentLoading(
          false,
        );
      }
    };

  const controlRuntime =
    async (
      action:
        'start'
        | 'pause'
        | 'resume'
        | 'stop',
    ) => {
      setRuntimeLoading(
        true,
      );

      setError(
        '',
      );

      try {
        const response =
          await fetch(
            `/api/tiktok/runtime/${action}`,
            {
              method:
                'POST',
              headers,
            },
          );

        const data =
          await response
            .json();

        if (!response.ok) {
          setError(
            data.error ??
            `Runtime ${action} failed`,
          );
          return;
        }

        await fetchProviderStatus();
      }
      catch {
        setError(
          `Runtime ${action} failed`,
        );
      }
      finally {
        setRuntimeLoading(
          false,
        );
      }
    };

  const checkRelationship =
    async () => {
      const username =
        relationshipUsername
          .trim()
          .replace(
            /^@/,
            '',
          );

      if (!username) {
        return;
      }

      if (!activeAgent) {
        setError(
          'Start the TikTok Android agent before checking a relationship.',
        );
        return;
      }

      setRelationshipChecking(
        true,
      );

      setRelationshipObservation(
        null,
      );

      setError(
        '',
      );

      try {
        const response =
          await fetch(
            '/api/tiktok/provider/check-relationship',
            {
              method:
                'POST',
              headers,
              body:
                JSON.stringify({
                  provider:
                    'android',
                  accountKey:
                    activeAgent.id,
                  username,
                }),
            },
          );

        const data =
          await response
            .json();

        if (!response.ok) {
          setError(
            data.error ??
            'Android relationship check failed',
          );
          return;
        }

        setRelationshipObservation(
          data.observation,
        );

        await fetchCoreOverview();
      }
      catch {
        setError(
          'Android relationship check failed',
        );
      }
      finally {
        setRelationshipChecking(
          false,
        );
      }
    };

  const resolveDiscoveryReview =
    async (
      reviewId:
        string,
      decision:
        'approved'
        | 'rejected',
    ) => {
      setReviewLoadingId(
        reviewId,
      );

      try {
        const response =
          await fetch(
            `/api/tiktok/reviews/${reviewId}/discovery-decision`,
            {
              method:
                'POST',
              headers,
              body:
                JSON.stringify({
                  decision,
                }),
            },
          );

        const data =
          await response
            .json();

        if (!response.ok) {
          setError(
            data.error ??
            'Failed to resolve discovery review',
          );
          return;
        }

        await Promise.all([
          fetchManualReviews(),
          fetchCoreOverview(),
        ]);
      }
      finally {
        setReviewLoadingId(
          null,
        );
      }
    };

  const cancelUnfollowReview =
    async (
      reviewId:
        string,
    ) => {
      if (
        !confirm(
          'Cancel this pending UNFOLLOW review? No TikTok unfollow will be executed.',
        )
      ) {
        return;
      }

      setReviewLoadingId(
        reviewId,
      );

      try {
        const response =
          await fetch(
            `/api/tiktok/reviews/${reviewId}/cancel-unfollow`,
            {
              method:
                'POST',
              headers,
            },
          );

        const data =
          await response
            .json();

        if (!response.ok) {
          setError(
            data.error ??
            'Failed to cancel UNFOLLOW review',
          );
          return;
        }

        await Promise.all([
          fetchManualReviews(),
          fetchCoreOverview(),
        ]);
      }
      finally {
        setReviewLoadingId(
          null,
        );
      }
    };

  const runtime =
    providerStatus
      ?.runtime;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-pink-400" />
            TikTok — Android only
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Operacao exclusiva pelo app Android via Appium/ADB.
          </p>
        </div>

        <button
          onClick={() => void refreshAll()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                {connection?.connected
                  ? <Wifi className="w-4 h-4 text-green-400" />
                  : <WifiOff className="w-4 h-4 text-red-400" />}
                Android / Appium
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                {connection?.connected
                  ? 'Appium connected'
                  : 'Appium not connected'}
              </p>
            </div>

            <span className={'px-2 py-1 rounded-full text-xs ' + (
              providerStatus?.mobileProvider.registered
                ? 'bg-green-500/15 text-green-400'
                : 'bg-zinc-800 text-zinc-500'
            )}>
              Provider {providerStatus?.mobileProvider.registered ? 'android' : 'offline'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Appium URL
              </label>
              <input
                value={appiumUrl}
                onChange={event => setAppiumUrl(event.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Android device
              </label>
              <select
                value={selectedDevice}
                onChange={event => setSelectedDevice(event.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
              >
                <option value="">Auto-detect</option>
                {devices.map(device => (
                  <option key={device.id} value={device.id}>
                    {device.id} — {device.model} ({device.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeAgent ? (
            <div className="mt-4 border border-zinc-800 rounded-lg p-3 bg-zinc-950/50">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={'w-2 h-2 rounded-full ' + (
                      activeAgent.state === 'running'
                        ? 'bg-green-400 animate-pulse'
                        : activeAgent.state === 'paused'
                          ? 'bg-yellow-400'
                          : 'bg-red-400'
                    )} />
                    <span className="text-sm text-white font-medium">
                      {activeAgent.deviceId}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {activeAgent.state}
                    </span>
                    {activeAgent.config.testMode && (
                      <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 text-xs">
                        TEST MODE
                      </span>
                    )}
                  </div>

                  <div className="mt-2 text-xs text-zinc-500">
                    action: {activeAgent.currentAction ?? 'idle'} · total: {activeAgent.stats.totalActions} · hour: {activeAgent.stats.actionsThisHour}
                  </div>

                  {activeAgent.lastError && (
                    <div className="mt-1 text-xs text-red-400">
                      {activeAgent.lastError}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {activeAgent.state === 'running' && (
                    <button
                      onClick={() => void controlMobileAgent('pause', activeAgent.id)}
                      disabled={agentLoading}
                      className="px-3 py-1.5 rounded bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-xs font-medium flex items-center gap-1.5"
                    >
                      <Pause className="w-3 h-3" />
                      Pause
                    </button>
                  )}

                  {activeAgent.state === 'paused' && (
                    <button
                      onClick={() => void controlMobileAgent('resume', activeAgent.id)}
                      disabled={agentLoading}
                      className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 text-xs font-medium flex items-center gap-1.5"
                    >
                      <Play className="w-3 h-3" />
                      Resume
                    </button>
                  )}

                  <button
                    onClick={() => void controlMobileAgent('stop', activeAgent.id)}
                    disabled={agentLoading}
                    className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 disabled:opacity-50 text-xs font-medium flex items-center gap-1.5"
                  >
                    <Square className="w-3 h-3" />
                    Stop
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-2">
                  Actions
                </label>
                <div className="flex flex-wrap gap-2">
                  {ACTION_OPTIONS.map(action => (
                    <button
                      key={action}
                      onClick={() => {
                        setAgentActions(previous =>
                          previous.includes(action)
                            ? previous.filter(item => item !== action)
                            : [...previous, action],
                        );
                      }}
                      className={'px-2.5 py-1 rounded text-xs font-medium ' + (
                        agentActions.includes(action)
                          ? 'bg-pink-600 text-white'
                          : 'bg-zinc-800 text-zinc-400'
                      )}
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Min delay (seconds)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={minDelaySeconds}
                    onChange={event => setMinDelaySeconds(Number(event.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Max actions/hour
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={maxActionsPerHour}
                    onChange={event => setMaxActionsPerHour(Number(event.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
                  />
                </div>

                <label className="flex items-end gap-2 pb-2 text-sm text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agentTestMode}
                    onChange={event => setAgentTestMode(event.target.checked)}
                  />
                  Test mode
                </label>
              </div>

              <button
                onClick={() => void startMobileAgent()}
                disabled={agentLoading || !connection?.connected || agentActions.length === 0}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-sm font-medium flex items-center gap-2"
              >
                {agentLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Play className="w-4 h-4" />}
                Start TikTok on Android
              </button>
            </div>
          )}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-sky-400" />
                Automation Core
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                Android relationship checks + persistent 48h follow-back scheduler
              </p>
            </div>

            <span className={'px-2 py-1 rounded-full text-xs ' + (
              runtime?.state === 'running'
                ? 'bg-green-500/15 text-green-400'
                : runtime?.state === 'paused'
                  ? 'bg-yellow-500/15 text-yellow-400'
                  : 'bg-zinc-800 text-zinc-400'
            )}>
              {runtime?.state ?? 'unknown'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {runtime?.state === 'stopped' && (
              <button
                onClick={() => void controlRuntime('start')}
                disabled={runtimeLoading}
                className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 text-xs font-medium"
              >
                Start core
              </button>
            )}

            {runtime?.state === 'running' && (
              <button
                onClick={() => void controlRuntime('pause')}
                disabled={runtimeLoading}
                className="px-3 py-1.5 rounded bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-xs font-medium"
              >
                Pause core
              </button>
            )}

            {runtime?.state === 'paused' && (
              <button
                onClick={() => void controlRuntime('resume')}
                disabled={runtimeLoading}
                className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 text-xs font-medium"
              >
                Resume core
              </button>
            )}

            {runtime?.state !== 'stopped' && (
              <button
                onClick={() => void controlRuntime('stop')}
                disabled={runtimeLoading}
                className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 disabled:opacity-50 text-xs font-medium"
              >
                Stop core
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-4">
            <div className="bg-zinc-950/60 rounded p-2">
              <div className="text-zinc-600">Provider</div>
              <div className="text-zinc-300">
                {runtime?.registeredProviders.join(', ') || '—'}
              </div>
            </div>

            <div className="bg-zinc-950/60 rounded p-2">
              <div className="text-zinc-600">Tick</div>
              <div className="text-zinc-300">
                {runtime?.tickActive ? 'active' : 'idle'}
              </div>
            </div>

            <div className="bg-zinc-950/60 rounded p-2">
              <div className="text-zinc-600">Processed</div>
              <div className="text-zinc-300">
                {runtime?.lastResult?.processed ?? '—'}
              </div>
            </div>

            <div className="bg-zinc-950/60 rounded p-2">
              <div className="text-zinc-600">Failed</div>
              <div className={runtime?.lastResult?.failed ? 'text-red-400' : 'text-zinc-300'}>
                {runtime?.lastResult?.failed ?? '—'}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Read-only relationship check on phone
            </label>

            <div className="flex gap-2">
              <input
                value={relationshipUsername}
                onChange={event => setRelationshipUsername(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    void checkRelationship();
                  }
                }}
                placeholder="@username"
                className="min-w-0 flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600"
              />

              <button
                onClick={() => void checkRelationship()}
                disabled={relationshipChecking || !activeAgent || !relationshipUsername.trim()}
                className="px-3 py-2 rounded bg-sky-600 hover:bg-sky-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-xs font-medium"
              >
                {relationshipChecking
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : 'Check'}
              </button>
            </div>

            {relationshipObservation && (
              <div className="mt-3 border border-zinc-800 rounded p-3 bg-zinc-950/60 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-500">
                    @{relationshipObservation.details?.username ?? relationshipUsername.replace(/^@/, '')}
                  </span>
                  <span className="text-sky-400 font-medium">
                    {relationshipObservation.relationship}
                  </span>
                </div>

                <div className="mt-1 text-zinc-600">
                  provider={relationshipObservation.provider} · device={relationshipObservation.details?.deviceId ?? activeAgent?.deviceId ?? '—'} · read-only
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeAgent && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-white">
                Android live logs
              </span>
            </div>
            <span className="text-xs text-zinc-600">
              {agentLogs.length}
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto bg-zinc-950 font-mono text-xs">
            {agentLogs.length === 0 ? (
              <div className="p-4 text-center text-zinc-600">
                No mobile-agent logs yet.
              </div>
            ) : agentLogs.map((log, index) => (
              <div
                key={index}
                className="px-3 py-1.5 border-b border-zinc-800/60 flex items-start gap-2"
              >
                <span className="text-zinc-600 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={
                  log.status === 'success'
                    ? 'text-green-400'
                    : log.status === 'error'
                      ? 'text-red-400'
                      : log.status === 'skipped'
                        ? 'text-yellow-400'
                        : 'text-zinc-500'
                }>
                  {log.status}
                </span>
                <span className="text-sky-400">
                  {log.action}
                </span>
                <span className="text-zinc-300">
                  {log.message}
                  {log.details ? ' — ' + log.details : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {manualReviews && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-medium text-white">
                Manual Review Queue
              </span>
            </div>

            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 rounded bg-zinc-800 text-zinc-400">
                total {manualReviews.counts.total}
              </span>
              <span className="px-2 py-1 rounded bg-sky-500/10 text-sky-400">
                discovery {manualReviews.counts.discovery}
              </span>
              <span className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-400">
                unfollow {manualReviews.counts.unfollow}
              </span>
            </div>
          </div>

          {manualReviews.reviews.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-600">
              No pending reviews.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {manualReviews.reviews.map(review => (
                <div key={review.id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={'px-2 py-0.5 rounded-full text-xs ' + (
                        review.kind === 'discovery'
                          ? 'bg-sky-500/15 text-sky-400'
                          : 'bg-yellow-500/15 text-yellow-400'
                      )}>
                        {review.kind === 'discovery' ? 'DISCOVERY' : 'UNFOLLOW REVIEW'}
                      </span>
                      <span className="text-xs text-zinc-600">
                        {review.provider}
                      </span>
                    </div>

                    <div className="mt-2 text-sm text-zinc-200">
                      {review.username
                        ? '@' + review.username
                        : review.displayName ?? review.targetKey ?? review.id}
                    </div>

                    <div className="mt-1 text-xs text-zinc-500">
                      {review.kind === 'discovery'
                        ? review.query ?? 'Discovery candidate'
                        : 'No follow-back after waiting period. Automatic unfollow remains disabled.'}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {review.kind === 'discovery' ? (
                      <>
                        <button
                          onClick={() => void resolveDiscoveryReview(review.id, 'approved')}
                          disabled={reviewLoadingId === review.id}
                          className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 text-xs font-medium"
                        >
                          Approve
                        </button>

                        <button
                          onClick={() => void resolveDiscoveryReview(review.id, 'rejected')}
                          disabled={reviewLoadingId === review.id}
                          className="px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-xs font-medium"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => void cancelUnfollowReview(review.id)}
                        disabled={reviewLoadingId === review.id}
                        className="px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-xs font-medium"
                      >
                        Cancel review
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {coreOverview && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-medium text-white">
                Persistent Core History
              </span>
            </div>
            <span className="text-xs text-zinc-600">
              Android
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 border-b border-zinc-800">
            <div className="bg-zinc-950/60 rounded p-3 text-center">
              <div className="text-lg font-bold text-white">
                {coreOverview.actions.total}
              </div>
              <div className="text-xs text-zinc-500">
                Actions
              </div>
            </div>

            <div className="bg-zinc-950/60 rounded p-3 text-center">
              <div className="text-lg font-bold text-sky-400">
                {coreOverview.relationships.total}
              </div>
              <div className="text-xs text-zinc-500">
                Relationships
              </div>
            </div>

            <div className="bg-zinc-950/60 rounded p-3 text-center">
              <div className="text-lg font-bold text-green-400">
                {coreOverview.relationships.processedCount}
              </div>
              <div className="text-xs text-zinc-500">
                Processed
              </div>
            </div>

            <div className="bg-zinc-950/60 rounded p-3 text-center">
              <div className="text-lg font-bold text-yellow-400">
                {coreOverview.relationships.protectedCount}
              </div>
              <div className="text-xs text-zinc-500">
                Protected
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="border-b lg:border-b-0 lg:border-r border-zinc-800">
              <div className="px-4 py-2 text-xs text-zinc-500">
                Recent action events
              </div>

              <div className="max-h-64 overflow-y-auto bg-zinc-950/40">
                {coreOverview.history.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-600">
                    No persisted action events yet.
                  </div>
                ) : coreOverview.history.map(item => (
                  <div key={item.id} className="px-4 py-2 border-t border-zinc-800/60 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-zinc-300">
                          {item.actionType ?? 'action'}
                        </span>
                        <span className="ml-2 text-sky-400">
                          {item.provider ?? '—'}
                        </span>
                        <span className="ml-2 text-zinc-500">
                          {item.status}
                        </span>
                      </div>

                      <span className="text-zinc-600 shrink-0">
                        {new Date(item.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="mt-1 text-zinc-600 truncate">
                      {item.targetUsername
                        ? '@' + item.targetUsername
                        : item.targetDisplayName ?? item.actionId}
                    </div>

                    {item.error && (
                      <div className="mt-1 text-red-400 truncate">
                        {item.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="px-4 py-2 text-xs text-zinc-500">
                Recent relationships
              </div>

              <div className="max-h-64 overflow-y-auto bg-zinc-950/40">
                {coreOverview.recentRelationships.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-600">
                    No persisted relationships yet.
                  </div>
                ) : coreOverview.recentRelationships.map(item => (
                  <div key={item.id} className="px-4 py-2 border-t border-zinc-800/60 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-zinc-300">
                        {item.username
                          ? '@' + item.username
                          : item.displayName ?? item.targetKey}
                      </span>

                      <span className="text-sky-400">
                        {item.relationshipState}
                      </span>
                    </div>

                    <div className="mt-1 text-zinc-600">
                      following={item.followedByUs ? 'yes' : 'no'} · follows-us={
                        item.followsUs === null
                          ? 'unknown'
                          : item.followsUs
                            ? 'yes'
                            : 'no'
                      } · processed={item.processed ? 'yes' : 'no'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
