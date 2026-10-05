/**
 * pi-notify — Settings TUI Component
 *
 * Interactive settings editor for notification configuration.
 * Allows toggling platforms, configuring credentials, and per-event settings.
 */

import type { Component } from "@earendil-works/pi-tui";
import { matchesKey } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  loadConfig,
  saveConfig,
  validateConfig,
} from "../settings.js";
import type { NotifyConfig, NotifyPlatform } from "../types.js";
import { OverlayTheme, boxInnerWidth } from "@pi-unipi/core";

/** Section types */
type Section = "platforms" | "events" | "recap" | "renotify";



const WINDOW_STEP_MS = 1_000;
const WINDOW_MIN_MS = 1_000;
const WINDOW_MAX_MS = 120_000;

const RENOTIFY_INTERVAL_INDEX = 1;
const RENOTIFY_MAX_REPEATS_INDEX = 2;
const RENOTIFY_INTERVAL_STEP_MS = 30_000;
const RENOTIFY_INTERVAL_MIN_MS = 10_000;
const RENOTIFY_INTERVAL_MAX_MS = 600_000;
const RENOTIFY_MAX_REPEATS_MAX = 10;

/** Format a re-notify interval as a compact duration label. */
function formatRenotifyInterval(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m${rest}s`;
}

/**
 * Settings overlay component.
 */
export class NotifySettingsOverlay implements Component {
  private config: NotifyConfig;
  private section: Section = "platforms";
  private selectedIndex = 0;
  /** Which silence-after-input chip is focused (0–3). */
  private chipIndex = 0;
  /** Whether the selected event is editing its platform routes. */
  private eventPlatformMode = false;
  /** Which platform chip is focused while editing an event. */
  private eventPlatformIndex = 0;
  private error: string | null = null;
  private saved = false;
  onClose?: () => void;
  requestRender?: () => void;
  /** Called when user presses M in recap section to open model selector */
  onOpenModelSelector?: () => void;
  private overlay = new OverlayTheme();

  constructor() {
    this.config = loadConfig();
  }

  setTheme(theme: Theme): void {
    this.overlay.setTheme(theme);
  }

  invalidate(): void {}

  handleInput(data: string): void {
    // Ctrl+C always closes — escape hatch for terminals with key encodings
    // this overlay does not understand (issue #27).
    if (matchesKey(data, "ctrl+c")) {
      this.onClose?.();
      return;
    }
    // Navigation keys are matched via matchesKey, never raw byte comparison:
    // under the kitty keyboard protocol / enhanced encodings (Ghostty, Herdr)
    // Escape arrives as "\x1b[27u" (or "\x1b[27;1;27~" with modifyOtherKeys)
    // and arrows as "\x1b[57419u"/"\x1b[57420u" — exact legacy comparisons
    // like data === "\x1b[A" silently fail there.
    if (this.section === "events" && this.eventPlatformMode) {
      if (data === "p" || data === "P" || matchesKey(data, "escape")) {
        this.eventPlatformMode = false;
        return;
      }
      if (matchesKey(data, "left") || data === "h") {
        this.eventPlatformIndex = Math.max(0, this.eventPlatformIndex - 1);
        return;
      }
      if (matchesKey(data, "right") || data === "l") {
        this.eventPlatformIndex = Math.min(this.platformKeys.length - 1, this.eventPlatformIndex + 1);
        return;
      }
      if (data === "r" || data === "R") {
        this.resetEventPlatforms();
        return;
      }
      if (matchesKey(data, "space")) {
        this.toggleEventPlatform();
        return;
      }
    }
    if (matchesKey(data, "up") || data === "k") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      return;
    }
    if (matchesKey(data, "down") || data === "j") {
      this.selectedIndex = Math.min(this.maxItems - 1, this.selectedIndex + 1);
      return;
    }
    if (this.section === "platforms" && this.selectedIndex === this.silenceChipsIndex) {
      if (matchesKey(data, "left") || data === "h") {
        this.chipIndex = Math.max(0, this.chipIndex - 1);
        return;
      }
      if (matchesKey(data, "right") || data === "l") {
        this.chipIndex = Math.min(this.platformKeys.length - 1, this.chipIndex + 1);
        return;
      }
    }
    if (this.section === "platforms" && this.selectedIndex === this.silenceMasterIndex) {
      if (data === "+" || data === "=") {
        this.nudgeWindow(WINDOW_STEP_MS);
        return;
      }
      if (data === "-" || data === "_") {
        this.nudgeWindow(-WINDOW_STEP_MS);
        return;
      }
    }
    if (this.section === "renotify") {
      if (data === "+" || data === "=") {
        this.nudgeRenotify(1);
        return;
      }
      if (data === "-" || data === "_") {
        this.nudgeRenotify(-1);
        return;
      }
    }
    if (matchesKey(data, "space")) {
      this.toggleCurrent();
      return;
    }
    if (matchesKey(data, "tab")) {
      const sections: Section[] = ["platforms", "events", "recap", "renotify"];
      const idx = sections.indexOf(this.section);
      this.section = sections[(idx + 1) % sections.length];
      this.selectedIndex = 0;
      this.eventPlatformMode = false;
      return;
    }
    if (data === "m" || data === "M") {
      // Open model selector (only in recap section)
      if (this.section === "recap") {
        this.onOpenModelSelector?.();
      }
      return;
    }
    if (data === "p" || data === "P") {
      if (this.section === "events") {
        this.eventPlatformMode = true;
        this.eventPlatformIndex = 0;
      }
      return;
    }
    if (matchesKey(data, "enter")) {
      this.save();
      return;
    }
    if (matchesKey(data, "escape")) {
      this.onClose?.();
      return;
    }
  }

  private get platformKeys(): NotifyPlatform[] {
    return ["native", ...this.config.webhooks.map((webhook): NotifyPlatform => `webhook:${webhook.id}`)];
  }
  private get suppressFocusedIndex(): number { return this.platformKeys.length; }
  private get silenceMasterIndex(): number { return this.platformKeys.length + 1; }
  private get silenceChipsIndex(): number { return this.platformKeys.length + 2; }

  private get maxItems(): number {
    if (this.section === "platforms") return this.platformKeys.length + 3;
    if (this.section === "recap") return 1; // toggle
    if (this.section === "renotify") return 3; // enable + interval + max repeats
    return Object.keys(this.config.events).length;
  }

  private nudgeWindow(delta: number): void {
    const current = this.config.silenceAfterInput.windowMs;
    this.config.silenceAfterInput.windowMs = Math.min(
      WINDOW_MAX_MS,
      Math.max(WINDOW_MIN_MS, current + delta),
    );
  }

  private nudgeRenotify(direction: number): void {
    const { renotify } = this.config;
    if (this.selectedIndex === RENOTIFY_INTERVAL_INDEX) {
      renotify.intervalMs = Math.min(
        RENOTIFY_INTERVAL_MAX_MS,
        Math.max(RENOTIFY_INTERVAL_MIN_MS, renotify.intervalMs + direction * RENOTIFY_INTERVAL_STEP_MS),
      );
    } else if (this.selectedIndex === RENOTIFY_MAX_REPEATS_INDEX) {
      renotify.maxRepeats = Math.min(
        RENOTIFY_MAX_REPEATS_MAX,
        Math.max(0, renotify.maxRepeats + direction),
      );
    }
  }

  private chipOn(key: NotifyPlatform): boolean {
    const listed = this.config.silenceAfterInput.platforms;
    if (listed.length === 0) return true;
    return listed.includes(key);
  }

  private toggleSilenceChip(key: NotifyPlatform): void {
    const listed = this.config.silenceAfterInput.platforms;
    const keys = this.platformKeys;
    const effective = listed.length === 0 ? keys.slice() : listed.slice();
    const idx = effective.indexOf(key);
    if (idx >= 0) {
      if (effective.length === 1) return;
      effective.splice(idx, 1);
    } else effective.push(key);
    const ordered = keys.filter((platform) => effective.includes(platform));
    this.config.silenceAfterInput.platforms = ordered.length === keys.length ? [] : ordered;
  }

  private selectedEventConfig(): { key: string; config: NotifyConfig["events"][string] } | undefined {
    const entry = Object.entries(this.config.events)[this.selectedIndex];
    if (!entry) return undefined;
    const [key, config] = entry;
    return { key, config };
  }

  private eventPlatformIsOn(platform: NotifyPlatform, eventConfig: NotifyConfig["events"][string]): boolean {
    const routes = eventConfig.platforms.length > 0
      ? eventConfig.platforms
      : this.config.defaultPlatforms;
    return routes.includes(platform);
  }

  private toggleEventPlatform(): void {
    const selected = this.selectedEventConfig();
    const platform = this.platformKeys[this.eventPlatformIndex];
    if (!selected || !platform) return;

    // An empty list inherits the global routes. Copy those routes before the
    // first edit so changing one chip does not mutate the global default.
    const routes = selected.config.platforms.length > 0
      ? selected.config.platforms.slice()
      : this.config.defaultPlatforms.slice();
    const index = routes.indexOf(platform);
    if (index >= 0) routes.splice(index, 1);
    else routes.push(platform);
    selected.config.platforms = this.platformKeys.filter((key) => routes.includes(key));
  }

  private resetEventPlatforms(): void {
    const selected = this.selectedEventConfig();
    if (selected) selected.config.platforms = [];
  }

  private toggleCurrent(): void {
    if (this.section === "platforms") {
      if (this.selectedIndex < this.platformKeys.length) {
        const key = this.platformKeys[this.selectedIndex];
        if (key === "native") this.config.native.enabled = !this.config.native.enabled;
        else if (key?.startsWith("webhook:")) {
          const webhook = this.config.webhooks.find((item) => `webhook:${item.id}` === key);
          if (webhook) {
            webhook.enabled = !webhook.enabled;
            if (webhook.enabled && !this.config.defaultPlatforms.includes(key)) this.config.defaultPlatforms.push(key);
            if (!webhook.enabled) this.config.defaultPlatforms = this.config.defaultPlatforms.filter((route) => route !== key);
          }
        }
      } else if (this.selectedIndex === this.suppressFocusedIndex) {
        this.config.native.suppressWhenFocused = !this.config.native.suppressWhenFocused;
      } else if (this.selectedIndex === this.silenceMasterIndex) {
        this.config.silenceAfterInput.enabled = !this.config.silenceAfterInput.enabled;
      } else if (this.selectedIndex === this.silenceChipsIndex) {
        const key = this.platformKeys[this.chipIndex];
        if (key) this.toggleSilenceChip(key);
      }
    } else if (this.section === "recap") {
      this.config.recap.enabled = !this.config.recap.enabled;
    } else if (this.section === "renotify") {
      if (this.selectedIndex === 0) {
        this.config.renotify.enabled = !this.config.renotify.enabled;
      }
    } else {
      const eventKeys = Object.keys(this.config.events);
      const key = eventKeys[this.selectedIndex];
      if (key && this.config.events[key]) {
        this.config.events[key].enabled = !this.config.events[key].enabled;
      }
    }
  }

  private save(): void {
    const errors = validateConfig(this.config);
    if (errors.length > 0) {
      this.error = errors.join("; ");
      return;
    }
    this.error = null;
    saveConfig(this.config);
    this.saved = true;
    setTimeout(() => this.onClose?.(), 500);
  }

  render(width: number): string[] {
    const innerWidth = boxInnerWidth(width);
    const lines: string[] = [];

    lines.push(this.overlay.borderLine(innerWidth, "top"));
    lines.push(this.overlay.frameLine(this.overlay.fg("accent", this.overlay.bold("🔔 Notify Settings")), innerWidth));
    lines.push(this.overlay.frameLine(this.overlay.fg("dim", "Configure notification platforms and events"), innerWidth));
    lines.push(this.overlay.ruleLine(innerWidth));

    // Section tabs
    const platformTab =
      this.section === "platforms"
        ? this.overlay.fg("accent", this.overlay.bold("[Platforms]"))
        : this.overlay.fg("dim", "Platforms");
    const eventsTab =
      this.section === "events"
        ? this.overlay.fg("accent", this.overlay.bold("[Events]"))
        : this.overlay.fg("dim", "Events");
    const recapTab =
      this.section === "recap"
        ? this.overlay.fg("accent", this.overlay.bold("[Recap]"))
        : this.overlay.fg("dim", "Recap");
    const renotifyTab =
      this.section === "renotify"
        ? this.overlay.fg("accent", this.overlay.bold("[Re-notify]"))
        : this.overlay.fg("dim", "Re-notify");
    lines.push(this.overlay.frameLine(`  ${platformTab}  ${eventsTab}  ${recapTab}  ${renotifyTab}`, innerWidth));
    lines.push(this.overlay.ruleLine(innerWidth));

    if (this.section === "platforms") {
      this.renderPlatforms(lines, innerWidth);
    } else if (this.section === "recap") {
      this.renderRecap(lines, innerWidth);
    } else if (this.section === "renotify") {
      this.renderRenotify(lines, innerWidth);
    } else {
      this.renderEvents(lines, innerWidth);
    }

    // Status messages
    if (this.error) {
      lines.push(this.overlay.ruleLine(innerWidth));
      lines.push(this.overlay.frameLine(`  ${this.overlay.fg("error", `⚠ ${this.error}`)}`, innerWidth));
    }
    if (this.saved) {
      lines.push(this.overlay.ruleLine(innerWidth));
      lines.push(this.overlay.frameLine(`  ${this.overlay.fg("success", "✓ Settings saved")}`, innerWidth));
    }

    // Footer
    lines.push(this.overlay.ruleLine(innerWidth));
    lines.push(this.overlay.frameLine(this.overlay.fg("dim", this.footerHint()), innerWidth));
    lines.push(this.overlay.borderLine(innerWidth, "bottom"));

    return lines;
  }

  private footerHint(): string {
    if (this.section === "events" && this.eventPlatformMode) {
      return "↑↓ event · ←→ platform · Space toggle route · R inherit defaults · P done · Enter save · Esc cancel";
    }
    if (this.section === "events") {
      return "↑↓ navigate · Space enable · P edit platforms · Tab switch · Enter save · Esc cancel";
    }
    if (this.section === "recap") {
      return "↑↓ navigate · Space toggle · M change model · Tab switch · Enter save · Esc cancel";
    }
    if (this.section === "renotify") {
      return "↑↓ navigate · Space toggle · +/− adjust · Tab switch · Enter save · Esc cancel";
    }
    if (this.section === "platforms" && this.selectedIndex === this.silenceMasterIndex) {
      return "↑↓ navigate · Space toggle · +/− window · Tab switch · Enter save · Esc cancel";
    }
    if (this.section === "platforms" && this.selectedIndex === this.silenceChipsIndex) {
      return "↑↓ navigate · ←→ channel · Space toggle · Tab switch · Enter save · Esc cancel";
    }
    return "↑↓ navigate · Space toggle · Tab switch · Enter save · Esc cancel";
  }

  private silenceSummary(): string {
    const seconds = Math.round(this.config.silenceAfterInput.windowMs / 1000);
    const listed = this.config.silenceAfterInput.platforms;
    const scope = listed.length === 0 ? "all enabled" : listed.join(", ");
    return `${seconds}s · ${scope}`;
  }

  private renderPlatforms(lines: string[], innerWidth: number): void {
    const platforms = this.platformKeys.map((key) => ({
      key,
      label: key === "native" ? "Native OS" : key.slice("webhook:".length),
      detail: key === "native" ? "Desktop notifications" : this.config.webhooks.find((item) => `webhook:${item.id}` === key)?.url ?? "",
    }));

    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      const isSelected = i === this.selectedIndex;
      const toggleOn = this.overlay.fg("success", "●");
      const toggleOff = this.overlay.fg("dim", "○");
      const isEnabled = p.key === "native" ? this.config.native.enabled : !!this.config.webhooks.find((item) => `webhook:${item.id}` === p.key)?.enabled;
      const toggle = isEnabled ? toggleOn : toggleOff;
      const label = isSelected ? this.overlay.bold(p.label) : this.overlay.fg("dim", p.label);

      lines.push(
        this.overlay.frameLine(
          `${isSelected ? this.overlay.fg("accent", "▸") : " "} ${toggle} ${label}  ${this.overlay.fg("dim", p.detail)}`,
          innerWidth
        )
      );
    }

    // suppressWhenFocused toggle (index 4)
    {
      const isSelected = this.selectedIndex === this.suppressFocusedIndex;
      const isEnabled = this.config.native.suppressWhenFocused === true;
      const toggleOn = this.overlay.fg("success", "●");
      const toggleOff = this.overlay.fg("dim", "○");
      const toggle = isEnabled ? toggleOn : toggleOff;
      const label = isSelected
        ? this.overlay.bold("Suppress when focused")
        : this.overlay.fg("dim", "Suppress when focused");
      const detail = this.overlay.fg("dim", isEnabled ? "Windows only — terminal in foreground → skip" : "Windows only");

      lines.push(
        this.overlay.frameLine(
          `${isSelected ? this.overlay.fg("accent", "▸") : " "} ${toggle} ${label}  ${detail}`,
          innerWidth
        )
      );
    }

    this.renderSilenceAfterInput(lines, innerWidth);
  }

  private renderSilenceAfterInput(lines: string[], innerWidth: number): void {
    const masterOn = this.config.silenceAfterInput.enabled;
    const masterSelected = this.selectedIndex === this.silenceMasterIndex;
    const toggle = masterOn
      ? this.overlay.fg("success", "●")
      : this.overlay.fg("dim", "○");
    const label = masterSelected
      ? this.overlay.bold("Quiet after activity")
      : this.overlay.fg("dim", "Quiet after activity");
    const detail = this.overlay.fg("dim", this.silenceSummary());
    lines.push(
      this.overlay.frameLine(
        `${masterSelected ? this.overlay.fg("accent", "▸") : " "} ${toggle} ${label}  ${detail}`,
        innerWidth,
      ),
    );

    const chipsSelected = this.selectedIndex === this.silenceChipsIndex;
    const chips = this.platformKeys.map((key, i) => {
      const on = this.chipOn(key);
      const mark = on ? "●" : "○";
      const label = key === "native" ? "Native" : key.slice("webhook:".length);
      const text = `${mark} ${label}`;
      const focused = chipsSelected && i === this.chipIndex;
      if (focused) {
        return this.overlay.fg("accent", this.overlay.bold(`[${text}]`));
      }
      const painted = on
        ? `${this.overlay.fg("success", mark)} ${label}`
        : this.overlay.fg("dim", text);
      return masterOn ? painted : this.overlay.fg("dim", text);
    });
    lines.push(
      this.overlay.frameLine(
        `${chipsSelected ? this.overlay.fg("accent", "▸") : " "}   ${chips.join("  ")}`,
        innerWidth,
      ),
    );
  }

  private renderEvents(lines: string[], innerWidth: number): void {
    const events = Object.entries(this.config.events);

    for (let i = 0; i < events.length; i++) {
      const [key, cfg] = events[i];
      const isSelected = i === this.selectedIndex;
      const toggleOn = this.overlay.fg("success", "●");
      const toggleOff = this.overlay.fg("dim", "○");
      const toggle = cfg.enabled ? toggleOn : toggleOff;
      const label = isSelected ? this.overlay.bold(key) : this.overlay.fg("dim", key);
      const routes = this.eventPlatformsSummary(cfg);

      lines.push(
        this.overlay.frameLine(
          `${isSelected ? this.overlay.fg("accent", "▸") : " "} ${toggle} ${label}  ${this.overlay.fg("dim", routes)}`,
          innerWidth
        )
      );

      if (isSelected && this.eventPlatformMode) {
        const chips = this.platformKeys.map((platform, index) => {
          const label = this.platformLabel(platform);
          const on = this.eventPlatformIsOn(platform, cfg);
          const mark = on ? "●" : "○";
          const focused = index === this.eventPlatformIndex;
          const text = `${mark} ${label}`;
          if (focused) return this.overlay.fg("accent", this.overlay.bold(`[${text}]`));
          return on
            ? `${this.overlay.fg("success", mark)} ${label}`
            : this.overlay.fg("dim", text);
        });
        lines.push(
          this.overlay.frameLine(
            `      ${this.overlay.fg("dim", "Platforms:")} ${chips.join("  ")}`,
            innerWidth,
          ),
        );
      }
    }
  }

  private platformLabel(platform: NotifyPlatform): string {
    return platform === "native" ? "Native" : platform.slice("webhook:".length);
  }

  private eventPlatformsSummary(eventConfig: NotifyConfig["events"][string]): string {
    if (eventConfig.platforms.length === 0) {
      const defaults = this.config.defaultPlatforms.map((platform) => this.platformLabel(platform));
      return `platforms: defaults${defaults.length > 0 ? ` (${defaults.join(", ")})` : ""}`;
    }
    return `platforms: ${eventConfig.platforms.map((platform) => this.platformLabel(platform)).join(", ")}`;
  }

  private renderRecap(lines: string[], innerWidth: number): void {
    // Toggle
    const isSelected = this.selectedIndex === 0;
    const toggleOn = this.overlay.fg("success", "●");
    const toggleOff = this.overlay.fg("dim", "○");
    const toggle = this.config.recap.enabled ? toggleOn : toggleOff;
    const label = isSelected
      ? this.overlay.bold("Enable Recap")
      : this.overlay.fg("dim", "Enable Recap");

    lines.push(
      this.overlay.frameLine(
        `${isSelected ? this.overlay.fg("accent", "▸") : " "} ${toggle} ${label}`,
        innerWidth
      )
    );

    // Current model display
    const modelRef = this.config.recap.model;
    const modelLabel = this.overlay.fg("dim", `  Model: ${modelRef}`);
    lines.push(this.overlay.frameLine(modelLabel, innerWidth));
    lines.push(
      this.overlay.frameLine(
        this.overlay.fg("dim", "  Press M to change model"),
        innerWidth
      )
    );
  }

  private renderRenotify(lines: string[], innerWidth: number): void {
    const toggleOn = this.overlay.fg("success", "●");
    const toggleOff = this.overlay.fg("dim", "○");
    const rows: Array<{ label: string; detail: string; toggle?: boolean }> = [
      {
        label: "Enable Re-notify",
        detail: "Remind while a question or permission prompt is unanswered",
        toggle: this.config.renotify.enabled,
      },
      {
        label: "Interval",
        detail: formatRenotifyInterval(this.config.renotify.intervalMs),
      },
      {
        label: "Max repeats",
        detail: `${this.config.renotify.maxRepeats}`,
      },
    ];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const isSelected = i === this.selectedIndex;
      const toggle = row.toggle === undefined ? " " : row.toggle ? toggleOn : toggleOff;
      const label = isSelected
        ? this.overlay.bold(row.label)
        : this.overlay.fg("dim", row.label);
      const detail =
        this.config.renotify.enabled || i === 0
          ? this.overlay.fg("dim", row.detail)
          : this.overlay.fg("dim", "—");
      lines.push(
        this.overlay.frameLine(
          `${isSelected ? this.overlay.fg("accent", "▸") : " "} ${toggle} ${label}  ${detail}`,
          innerWidth,
        ),
      );
    }
    lines.push(
      this.overlay.frameLine(
        this.overlay.fg("dim", "  Blocking prompts only (ask_user, permission_request)"),
        innerWidth,
      ),
    );
  }
}
