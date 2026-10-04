import type { WebhookConfig } from "./types.js";

export interface NotificationTemplateContext {
  title: string;
  message: string;
  eventType: string;
  priority?: string;
  payload?: unknown;
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function resolvePath(context: NotificationTemplateContext, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value === null || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, context);
}

function interpolateString(value: string, context: NotificationTemplateContext): unknown {
  const exact = value.match(/^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/);
  if (exact) return resolvePath(context, exact[1]!);
  return value.replace(TOKEN, (_token, path: string) => {
    const resolved = resolvePath(context, path);
    if (resolved === undefined || resolved === null) return "";
    return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
  });
}

function renderTemplate(value: unknown, context: NotificationTemplateContext): unknown {
  if (typeof value === "string") return interpolateString(value, context);
  if (Array.isArray(value)) return value.map((entry) => renderTemplate(entry, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, renderTemplate(entry, context)]),
    );
  }
  return value;
}

/** Render body, URL and header templates without evaluating user-supplied code. */
export function renderWebhookTemplate<T>(template: T, context: NotificationTemplateContext): T {
  return renderTemplate(template, context) as T;
}

export async function sendWebhookNotification(
  webhook: WebhookConfig,
  context: NotificationTemplateContext,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = renderWebhookTemplate(webhook.url, context);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`HTTP webhook ${webhook.id} resolved to an invalid URL`);
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`HTTP webhook ${webhook.id} URL must use HTTP or HTTPS`);
  }
  const renderedHeaders = renderWebhookTemplate(webhook.headers ?? {}, context);
  const headers = Object.fromEntries(
    Object.entries(renderedHeaders).map(([name, value]) => [name, String(value ?? "")]),
  );
  const body = renderWebhookTemplate(
    webhook.body ?? { title: "{{title}}", message: "{{message}}" },
    context,
  );
  const response = await fetchImpl(parsedUrl, {
    method: webhook.method || "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(`HTTP webhook ${webhook.id} failed (${response.status}): ${responseBody}`);
  }
}
