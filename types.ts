/**
 * pi-notify — TypeScript type definitions
 */

/** Native notifications and user-defined HTTP webhook routes. */
export type NotifyPlatform = "native" | `webhook:${string}`;

/** Per-event notification configuration */
export interface EventNotifyConfig {
  /** Whether this event type is enabled */
  enabled: boolean;
  /** Platforms to send to (empty = use global defaults) */
  platforms: NotifyPlatform[];
}

/** Native notification platform config */
export interface NativeConfig {
  /** Whether native notifications are enabled */
  enabled: boolean;
  /** Windows appID to show instead of "SnoreToast" */
  windowsAppId?: string;
  /**
   * When true, suppresses the notification if the terminal window is the
   * foreground (active) window. Only effective on supported platforms
   * (currently Windows). Default: false.
   */
  suppressWhenFocused?: boolean;
}

/** A user-defined HTTP notification endpoint. */
export interface WebhookConfig {
  /** Stable identifier used in routes, e.g. `webhook:build-alerts`. */
  id: string;
  enabled: boolean;
  url: string;
  /** HTTP headers, with optional notification placeholders in values. */
  headers: Record<string, string>;
  /** JSON-compatible template; string values may contain placeholders. */
  body?: unknown;
  /** Defaults to POST. */
  method?: string;
}

/** Recap notification config */
export interface RecapConfig {
  /** Whether recap summarization is enabled */
  enabled: boolean;
  /** Model to use for recap (e.g. "openrouter/openai/gpt-oss-20b") */
  model: string;
  /**
   * Send `chat_template_kwargs: { enable_thinking: false, preserve_thinking: false }`
   * with recap requests so llama.cpp/vLLM-style servers skip reasoning tokens.
   * Without this, a thinking model can burn the entire 100-token budget on
   * reasoning and return no summary (issue #36). Only enable for endpoints
   * that accept these params — strict OpenAI-compatible servers reject them.
   * The Anthropic path ignores this (thinking is opt-in there already).
   */
  disableThinking?: boolean;
}

/** Quiet listed platforms after recent terminal input */
export interface SilenceAfterInputConfig {
  /** Master switch */
  enabled: boolean;
  /** Quiet window after the last keypress, in milliseconds */
  windowMs: number;
  /** Platforms to suppress (empty = all enabled platforms) */
  platforms: NotifyPlatform[];
}

/** Re-send an unanswered human-blocking prompt until someone acts */
export interface RenotifyConfig {
  /** Master switch */
  enabled: boolean;
  /** Delay between reminders, in milliseconds */
  intervalMs: number;
  /** Reminders to send after the first notification (0 = none) */
  maxRepeats: number;
}

/** Full notification configuration */
export interface NotifyConfig {
  /** Global default platforms for all events */
  defaultPlatforms: NotifyPlatform[];
  /** Per-event type overrides */
  events: Record<string, EventNotifyConfig>;
  /** Native platform settings */
  native: NativeConfig;
  /** User-defined HTTP webhook endpoints */
  webhooks: WebhookConfig[];
  /** Recap summarization settings */
  recap: RecapConfig;
  /** Suppress listed platforms after recent terminal input */
  silenceAfterInput: SilenceAfterInputConfig;
  /** Re-notify unanswered human-blocking prompts */
  renotify: RenotifyConfig;
}

/** Parameters for the notify_user agent tool */
export type NotifyPriority = "low" | "normal" | "high";

export interface NotifyUserParams {
  /** Notification message body */
  message: string;
  /** Notification title (default: "Pi Notification") */
  title?: string;
  /** Priority level */
  priority?: NotifyPriority;
  /** Override platforms for this notification */
  platforms?: NotifyPlatform[];
}

/** Result of sending a notification to a single platform */
export interface NotifyResult {
  /** Platform that was targeted */
  platform: NotifyPlatform;
  /** Whether the send succeeded */
  success: boolean;
  /** True when the notification was intentionally suppressed (e.g. window focused) */
  suppressed?: boolean;
  /** Effective numeric priority for platforms that support it. */
  priority?: number;
  /** Error message if failed */
  error?: string;
}

/** Notification dispatch summary */
export interface NotifyDispatchResult {
  /** Results per platform */
  results: NotifyResult[];
  /** Whether all platforms succeeded */
  allSuccess: boolean;
}
