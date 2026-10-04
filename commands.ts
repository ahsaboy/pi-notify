import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { UNIPI_PREFIX, NOTIFY_COMMANDS } from "@pi-unipi/core";
import type { CachedModel } from "@pi-unipi/core";
import { NotifySettingsOverlay } from "./tui/settings-overlay.js";
import { RecapModelSelectorOverlay } from "./tui/recap-model-selector.js";
import { dispatchNotification } from "./events.js";
import { loadConfig, saveConfig } from "./settings.js";

function registryModels(ctx: ExtensionContext): CachedModel[] | undefined {
  const registry = ctx.modelRegistry;
  if (!registry) return undefined;
  try {
    const models = registry.getAvailable?.() ?? registry.getAll() ?? [];
    return models.map((m) => ({ provider: m.provider, id: m.id, name: m.name }));
  } catch {
    return undefined;
  }
}

export function registerNotifyCommands(pi: ExtensionAPI): void {
  pi.registerCommand(`${UNIPI_PREFIX}${NOTIFY_COMMANDS.SETTINGS}`, {
    description: "Configure notification webhooks and events",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return void ctx.ui.notify("Settings require an interactive UI.", "warning");
      ctx.ui.custom((tui, theme, _kb, done) => {
        const overlay = new NotifySettingsOverlay();
        overlay.setTheme(theme);
        overlay.onClose = () => done(undefined);
        overlay.requestRender = () => tui.requestRender();
        overlay.onOpenModelSelector = () => ctx.ui.custom((innerTui, innerTheme, _innerKb, innerDone) => {
          const selector = new RecapModelSelectorOverlay(registryModels(ctx));
          selector.setTheme(innerTheme);
          selector.onClose = () => innerDone(undefined);
          selector.requestRender = () => innerTui.requestRender();
          return {
            render: (w: number) => selector.render(w),
            invalidate: () => selector.invalidate(),
            handleInput: (data: string) => { selector.handleInput(data); innerTui.requestRender(); },
          };
        }, { overlay: true, overlayOptions: { width: "60%", minWidth: 40, anchor: "center", margin: 4 } });
        return {
          render: (w: number) => overlay.render(w),
          invalidate: () => overlay.invalidate(),
          handleInput: (data: string) => { overlay.handleInput(data); tui.requestRender(); },
        };
      }, { overlay: true, overlayOptions: { width: "80%", minWidth: 60, anchor: "center", margin: 2 } });
    },
  });

  pi.registerCommand(`${UNIPI_PREFIX}${NOTIFY_COMMANDS.RECAP_MODEL}`, {
    description: "Select model for notification recaps",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return void ctx.ui.notify("Model selector requires an interactive UI.", "warning");
      ctx.ui.custom((tui, theme, _kb, done) => {
        const overlay = new RecapModelSelectorOverlay(registryModels(ctx));
        overlay.setTheme(theme);
        overlay.onClose = () => done(undefined);
        overlay.requestRender = () => tui.requestRender();
        return {
          render: (w: number) => overlay.render(w),
          invalidate: () => overlay.invalidate(),
          handleInput: (data: string) => { overlay.handleInput(data); tui.requestRender(); },
        };
      }, { overlay: true, overlayOptions: { width: "60%", minWidth: 40, anchor: "center", margin: 4 } });
    },
  });

  pi.registerCommand(`${UNIPI_PREFIX}${NOTIFY_COMMANDS.NOTIFY_EVENT}`, {
    description: "Toggle a notify event without the TUI: <event> <on|off>",
    handler: async (args, ctx) => {
      const [event, value, ...extra] = args.trim().split(/\s+/).filter(Boolean);
      const config = loadConfig();
      if (extra.length || !event || (value !== "on" && value !== "off")) {
        ctx.ui.notify("Usage: /unipi:notify-event <event> <on|off>", "warning");
        return;
      }
      if (!(event in config.events)) {
        ctx.ui.notify(`Unknown event "${event}". Known events: ${Object.keys(config.events).join(", ")}`, "error");
        return;
      }
      config.events[event]!.enabled = value === "on";
      saveConfig(config);
      ctx.ui.notify(`notify: ${event} is now ${value}. Run /reload to re-register listeners.`, "info");
    },
  });

  pi.registerCommand(`${UNIPI_PREFIX}${NOTIFY_COMMANDS.TEST}`, {
    description: "Send a test notification to enabled routes",
    handler: async (_args, ctx) => {
      const config = loadConfig();
      const routes = config.defaultPlatforms;
      if (!routes.length) {
        ctx.ui.notify("No default routes configured. Edit defaultPlatforms in notify config.", "warning");
        return;
      }
      const result = await dispatchNotification(
        pi, "Pi — Test Notification", `Test notification sent at ${new Date().toLocaleTimeString()}`,
        routes, "test", config, process.cwd(), "normal", { test: true },
      );
      const lines = result.results.map((item) => `${item.success ? "OK" : "FAIL"} ${item.platform}${item.error ? `: ${item.error}` : ""}`);
      ctx.ui.notify(lines.join("\n") || "No enabled routes selected.", result.allSuccess ? "info" : "warning");
    },
  });
}
