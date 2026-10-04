/**
 * pi-notify — Agent tool registration
 *
 * Registers the `notify_user` tool for ad-hoc notifications.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { NOTIFY_TOOLS } from "@pi-unipi/core";
import { loadConfig } from "./settings.js";
import { dispatchNotification } from "./events.js";
import type { NotifyPriority } from "./types.js";

/** Schema for notify_user tool parameters */
const NotifyUserSchema = Type.Object({
  message: Type.String({ description: "Notification message body" }),
  title: Type.Optional(
    Type.String({ description: "Notification title (default: Pi Notification)" })
  ),
  priority: Type.Optional(
    Type.String({
      enum: ["low", "normal", "high"],
      description: "Priority level",
    })
  ),
  platforms: Type.Optional(
    Type.Array(
      Type.String({ pattern: "^(native|webhook:[a-zA-Z0-9_-]+)$" }),
      { description: "Override routes: native or webhook:<id>" }
    )
  ),
});

/**
 * Register the notify_user tool with pi.
 */
export function registerNotifyTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: NOTIFY_TOOLS.NOTIFY_USER,
    label: "Notify User",
    description:
      "Send a notification to configured native or HTTP webhook routes. " +
      "Use for critical errors, completion of long-running tasks, or when the user explicitly asked to be notified.",
    parameters: NotifyUserSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx: ExtensionContext) {
      const {
        message,
        title,
        priority,
        platforms,
      } = params as {
        message: string;
        title?: string;
        priority?: NotifyPriority;
        platforms?: Array<"native" | `webhook:${string}`>;
      };

      const config = loadConfig();

      // Resolve title
      const notifTitle = title || "Pi Notification";

      // Resolve platforms — use params.platforms or global defaults
      const notifPlatforms = platforms || config.defaultPlatforms;

      // Fire-and-forget: dispatch in background so the tool doesn't block the agent
      const cwd = process.cwd();
      const dispatchPromise = dispatchNotification(
        pi,
        notifTitle,
        message,
        notifPlatforms,
        "agent_tool",
        config,
        cwd,
        priority,
      );
      void dispatchPromise.catch(() => {
        // Silently ignore — background dispatch failure is non-blocking.
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Notification sending to ${notifPlatforms.length} platform(s): ${notifPlatforms.join(", ")}`,
          },
        ],
        details: { platforms: notifPlatforms, priority },
      };
    },
  });
}
