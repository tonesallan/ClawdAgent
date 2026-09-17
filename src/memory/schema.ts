import { sql } from 'drizzle-orm';
﻿import { pgTable, text, timestamp, integer, boolean, jsonb, uuid, varchar, index, serial, real, doublePrecision, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  platformId: varchar('platform_id', { length: 100 }).notNull(),
  platform: varchar('platform', { length: 20 }).notNull(),
  name: varchar('name', { length: 200 }),
  role: varchar('role', { length: 20 }).default('user').notNull(),
  masterUserId: uuid('master_user_id'),
  preferences: jsonb('preferences').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_users_platform').on(table.platform, table.platformId),
  index('idx_users_master').on(table.masterUserId),
]);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  platform: varchar('platform', { length: 20 }).notNull(),
  title: varchar('title', { length: 200 }),
  isActive: boolean('is_active').default(true).notNull(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_conversations_user').on(table.userId),
]);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content').notNull(),
  agentId: varchar('agent_id', { length: 50 }),
  intent: varchar('intent', { length: 50 }),
  tokensUsed: jsonb('tokens_used'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_messages_conversation').on(table.conversationId),
  index('idx_messages_user').on(table.userId),
]);

export const knowledge = pgTable('knowledge', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  key: varchar('key', { length: 200 }).notNull(),
  value: text('value').notNull(),
  category: varchar('category', { length: 50 }).default('general'),
  confidence: integer('confidence').default(80),
  source: varchar('source', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_knowledge_user').on(table.userId),
]);

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  priority: varchar('priority', { length: 5 }).default('p2').notNull(),
  dueDate: timestamp('due_date'),
  completedAt: timestamp('completed_at'),
  tags: jsonb('tags').default([]),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_tasks_user').on(table.userId),
  index('idx_tasks_status').on(table.status),
]);

export const servers = pgTable('servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  host: varchar('host', { length: 200 }).notNull(),
  port: integer('port').default(22).notNull(),
  username: varchar('username', { length: 100 }).notNull(),
  authMethod: varchar('auth_method', { length: 20 }).default('key').notNull(),
  encryptedCredential: text('encrypted_credential'),
  status: varchar('status', { length: 20 }).default('unknown'),
  lastChecked: timestamp('last_checked'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_servers_user').on(table.userId),
]);

export const cronTasks = pgTable('cron_tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  expression: text('expression').notNull(),
  action: text('action').notNull(),
  actionData: text('action_data').default('{}'),
  platform: text('platform').default('telegram'),
  enabled: boolean('enabled').default(true),
  lastRun: timestamp('last_run'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const documentChunks = pgTable('document_chunks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  text: text('text').notNull(),
  source: text('source').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  embedding: text('embedding').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usageLogs = pgTable('usage_logs', {
  id: serial('id').primaryKey(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  cost: real('cost').default(0),
  userId: text('user_id').notNull(),
  action: text('action').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// Crypto Trading tables
// ---------------------------------------------------------------------------

export const exchangeConfigs = pgTable('exchange_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  exchange: varchar('exchange', { length: 50 }).notNull(),      // binance, okx
  encryptedApiKey: text('encrypted_api_key').notNull(),
  encryptedApiSecret: text('encrypted_api_secret').notNull(),
  encryptedPassphrase: text('encrypted_passphrase'),             // OKX only
  isActive: boolean('is_active').default(true).notNull(),
  label: varchar('label', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_exchange_configs_user').on(table.userId),
]);

export const trades = pgTable('trades', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  exchange: varchar('exchange', { length: 50 }).notNull(),
  symbol: varchar('symbol', { length: 30 }).notNull(),           // BTC/USDT
  side: varchar('side', { length: 10 }).notNull(),               // buy, sell
  type: varchar('type', { length: 20 }).default('market'),       // market, limit
  price: doublePrecision('price').notNull(),
  amount: doublePrecision('amount').notNull(),
  cost: doublePrecision('cost').notNull(),                       // price * amount
  fee: doublePrecision('fee').default(0),
  stopLoss: doublePrecision('stop_loss'),
  takeProfit: doublePrecision('take_profit'),
  pnl: doublePrecision('pnl'),                                  // realized P&L
  pnlPercent: doublePrecision('pnl_percent'),
  strategy: varchar('strategy', { length: 50 }),                 // scalping, day-trading, swing, dca
  status: varchar('status', { length: 20 }).default('open').notNull(), // open, closed, cancelled
  isPaper: boolean('is_paper').default(true).notNull(),
  closedAt: timestamp('closed_at'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_trades_user').on(table.userId),
  index('idx_trades_symbol').on(table.symbol),
  index('idx_trades_status').on(table.status),
]);

export const portfolios = pgTable('portfolios', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  exchange: varchar('exchange', { length: 50 }).notNull(),
  asset: varchar('asset', { length: 20 }).notNull(),             // BTC, ETH, USDT
  amount: doublePrecision('amount').default(0).notNull(),
  avgEntryPrice: doublePrecision('avg_entry_price'),
  currentPrice: doublePrecision('current_price'),
  unrealizedPnl: doublePrecision('unrealized_pnl'),
  isPaper: boolean('is_paper').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_portfolios_user').on(table.userId),
]);

export const tradingSignals = pgTable('trading_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  symbol: varchar('symbol', { length: 30 }).notNull(),
  timeframe: varchar('timeframe', { length: 10 }).notNull(),     // 1m, 5m, 15m, 1h, 4h, 1d
  direction: varchar('direction', { length: 10 }).notNull(),     // long, short, neutral
  confidence: doublePrecision('confidence').notNull(),            // 0-100
  strategy: varchar('strategy', { length: 50 }).notNull(),
  entryPrice: doublePrecision('entry_price'),
  stopLoss: doublePrecision('stop_loss'),
  takeProfit: doublePrecision('take_profit'),
  indicators: jsonb('indicators').default({}),                   // RSI, MACD values etc
  outcome: varchar('outcome', { length: 20 }),                   // win, loss, expired, null
  isActive: boolean('is_active').default(true).notNull(),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_signals_symbol').on(table.symbol),
  index('idx_signals_active').on(table.isActive),
]);

export const tradingRiskConfig = pgTable('trading_risk_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  paperMode: boolean('paper_mode').default(true).notNull(),
  maxPositionPercent: doublePrecision('max_position_percent').default(5),
  maxOpenPositions: integer('max_open_positions').default(3),
  maxDailyLossPercent: doublePrecision('max_daily_loss_percent').default(3),
  maxDailyLossUsd: doublePrecision('max_daily_loss_usd').default(100),
  defaultSlPercent: doublePrecision('default_sl_percent').default(2),
  defaultTpPercent: doublePrecision('default_tp_percent').default(4),
  cooldownMinutes: integer('cooldown_minutes').default(5),
  maxLeverage: doublePrecision('max_leverage').default(2),
  allowedPairs: jsonb('allowed_pairs').default([]),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_risk_config_user').on(table.userId),
]);

// ---------------------------------------------------------------------------
// Persistent Memory tables (Cross-Session Memory â€” AGI 2026)
// ---------------------------------------------------------------------------

export const memoryEntries = pgTable('memory_entries', {
  id: text('id').primaryKey(),
  layer: varchar('layer', { length: 30 }).notNull(),         // execution, infrastructure, strategic, skill, error
  key: varchar('key', { length: 500 }).notNull(),
  value: text('value').notNull(),
  tags: jsonb('tags').default([]),
  impact: doublePrecision('impact').default(0.5),
  accessCount: integer('access_count').default(0),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastAccessed: timestamp('last_accessed').defaultNow().notNull(),
}, (table) => [
  index('idx_memory_layer').on(table.layer),
  index('idx_memory_impact').on(table.impact),
]);

export const failurePatterns = pgTable('failure_patterns', {
  id: uuid('id').primaryKey().defaultRandom(),
  errorType: varchar('error_type', { length: 200 }).notNull(),
  context: text('context').notNull(),
  count: integer('count').default(1).notNull(),
  resolution: text('resolution'),
  resolved: boolean('resolved').default(false).notNull(),
  lastSeen: timestamp('last_seen').defaultNow().notNull(),
}, (table) => [
  index('idx_failure_error_type').on(table.errorType),
  index('idx_failure_resolved').on(table.resolved),
]);

export const experienceRecords = pgTable('experience_records', {
  id: text('id').primaryKey(),
  taskType: varchar('task_type', { length: 100 }).notNull(),
  input: text('input').notNull(),
  output: text('output').notNull(),
  success: boolean('success').default(false).notNull(),
  agentUsed: varchar('agent_used', { length: 50 }).notNull(),
  toolsUsed: jsonb('tools_used').default([]),
  duration: integer('duration').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_experience_task_type').on(table.taskType),
  index('idx_experience_success').on(table.success),
]);

export const webCredentials = pgTable('web_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).default('user').notNull(),
  lastLogin: timestamp('last_login'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_web_credentials_username').on(table.username),
]);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  action: varchar('action', { length: 100 }).notNull(),
  resource: varchar('resource', { length: 100 }),
  details: jsonb('details').default({}),
  ip: varchar('ip', { length: 50 }),
  platform: varchar('platform', { length: 20 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_audit_user').on(table.userId),
  index('idx_audit_action').on(table.action),
]);

// ---------------------------------------------------------------------------
// TikTok automation persistence
// ---------------------------------------------------------------------------

/**
 * Estado persistente de cada relacionamento observado no TikTok.
 *
 * targetKey existe porque nem toda linha do TikTok expoe o @username.
 * Quando username estiver disponivel, targetKey normalmente sera:
 *
 *   username:<username>
 *
 * Caso contrario, o RelationshipManager podera usar uma chave
 * persistente derivada da identidade observada pelo provider.
 */
export const tiktokUserRelationships = pgTable('tiktok_user_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),

  accountKey: varchar('account_key', { length: 100 })
    .default('default')
    .notNull(),

  targetKey: varchar('target_key', { length: 250 }).notNull(),

  username: varchar('username', { length: 100 }),

  displayName: varchar('display_name', { length: 200 }),

  relationshipState: varchar('relationship_state', { length: 30 })
    .default('unknown')
    .notNull(),

  followsUs: boolean('follows_us'),

  followedByUs: boolean('followed_by_us')
    .default(false)
    .notNull(),

  followedByUsAt: timestamp('followed_by_us_at'),

  followBackCheckAt: timestamp('follow_back_check_at'),

  lastCheckedAt: timestamp('last_checked_at'),

  protected: boolean('protected')
    .default(false)
    .notNull(),

  processed: boolean('processed')
    .default(false)
    .notNull(),

  metadata: jsonb('metadata').default({}),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),

  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull(),
}, (table) => [
  uniqueIndex('uq_tiktok_relationship_account_target')
    .on(table.accountKey, table.targetKey),

  index('idx_tiktok_relationship_username')
    .on(table.username),

  index('idx_tiktok_relationship_state')
    .on(table.relationshipState),

  index('idx_tiktok_relationship_followback_check')
    .on(table.followBackCheckAt),

  index('idx_tiktok_relationship_protected')
    .on(table.protected),
]);


/**
 * Fila persistente de acoes da automacao TikTok.
 *
 * Tipos previstos:
 * FOLLOW
 * UNFOLLOW
 * LIKE
 * COMMENT
 * DM
 * PROFILE_VISIT
 * WATCH_VIDEO
 * POST
 * CHECK_FOLLOW_BACK
 *
 * executeAt permite agendamento persistente sem sleep().
 */
export const tiktokActions = pgTable('tiktok_actions', {
  id: uuid('id').primaryKey().defaultRandom(),

  accountKey: varchar('account_key', { length: 100 })
    .default('default')
    .notNull(),

  type: varchar('type', { length: 40 }).notNull(),

  targetKey: varchar('target_key', { length: 250 }),

  targetUsername: varchar('target_username', { length: 100 }),

  targetDisplayName: varchar('target_display_name', { length: 200 }),

  status: varchar('status', { length: 20 })
    .default('pending')
    .notNull(),

  executeAt: timestamp('execute_at'),

  priority: integer('priority')
    .default(5)
    .notNull(),

  attempts: integer('attempts')
    .default(0)
    .notNull(),

  maxAttempts: integer('max_attempts')
    .default(3)
    .notNull(),

  provider: varchar('provider', { length: 30 })
    .default('android')
    .notNull(),

  payload: jsonb('payload').default({}),

  result: jsonb('result'),

  error: text('error'),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),

  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull(),
}, (table) => [
  index('idx_tiktok_actions_status')
    .on(table.status),

  index('idx_tiktok_actions_execute_at')
    .on(table.executeAt),

  index('idx_tiktok_actions_type')
    .on(table.type),

  index('idx_tiktok_actions_account_status')
    .on(table.accountKey, table.status),

  index('idx_tiktok_actions_target')
    .on(table.targetKey),

  /*
   * At most one logically equivalent OPEN action may exist.
   *
   * Terminal rows remain outside this index so historical
   * SUCCESS / FAILED / CANCELLED actions never block a future
   * legitimate occurrence.
   */
  uniqueIndex('uq_tiktok_actions_open_account_type_target')
    .on(
      table.accountKey,
      table.type,
      table.targetKey,
    )
    .where(
      sql`${table.status} in ('pending', 'scheduled', 'running')`,
    ),
]);


/**
 * Auditoria imutavel das transicoes e execucoes das acoes.
 */
export const tiktokActionHistory = pgTable('tiktok_action_history', {
  id: uuid('id').primaryKey().defaultRandom(),

  actionId: uuid('action_id')
    .references(() => tiktokActions.id)
    .notNull(),

  status: varchar('status', { length: 20 }).notNull(),

  provider: varchar('provider', { length: 30 }),

  result: jsonb('result'),

  error: text('error'),

  metadata: jsonb('metadata').default({}),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
}, (table) => [
  index('idx_tiktok_action_history_action')
    .on(table.actionId),

  index('idx_tiktok_action_history_status')
    .on(table.status),

  index('idx_tiktok_action_history_created')
    .on(table.createdAt),
]);


/**
 * Configuracoes editaveis futuramente pelo painel Python.
 *
 * Exemplos:
 * follow_enabled
 * unfollow_enabled
 * follow_back_check_hours
 * dry_run
 * comments_enabled
 * hashtags_enabled
 */
export const tiktokConfiguration = pgTable('tiktok_configuration', {
  key: varchar('key', { length: 100 }).primaryKey(),

  value: jsonb('value').notNull(),

  description: text('description'),

  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull(),
});


/**
 * Politicas de limite por tipo de acao.
 *
 * O painel Python podera alterar esses valores sem alterar codigo.
 */
export const tiktokActionLimits = pgTable('tiktok_action_limits', {
  id: uuid('id').primaryKey().defaultRandom(),

  accountKey: varchar('account_key', { length: 100 })
    .default('default')
    .notNull(),

  actionType: varchar('action_type', { length: 40 }).notNull(),

  enabled: boolean('enabled')
    .default(true)
    .notNull(),

  dailyLimit: integer('daily_limit'),

  hourlyLimit: integer('hourly_limit'),

  minIntervalSeconds: integer('min_interval_seconds'),

  maxIntervalSeconds: integer('max_interval_seconds'),

  cooldownSeconds: integer('cooldown_seconds'),

  allowedHours: jsonb('allowed_hours').default([]),

  allowedWeekdays: jsonb('allowed_weekdays').default([]),

  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),

  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull(),
}, (table) => [
  uniqueIndex('uq_tiktok_action_limits_account_type')
    .on(table.accountKey, table.actionType),

  index('idx_tiktok_action_limits_enabled')
    .on(table.enabled),
]);


