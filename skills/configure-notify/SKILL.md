---
name: configure-notify
description: >
  Help configure Pi native notifications and user-defined HTTP webhooks,
  including event routing and placeholder templates.
---

# Configure Notify

Help users configure `pi-notify` using `~/.unipi/config/notify/config.json`.

## Webhook configuration

Each endpoint is an entry in `webhooks`, identified by a stable `id`. Configure `url`, `headers`, and an optional JSON-compatible `body`; `method` defaults to `POST`. Enable it with `enabled: true` and route it using `webhook:<id>` in `defaultPlatforms` or an event's `platforms` list.

```json
{
  "defaultPlatforms": ["webhook:alerts"],
  "webhooks": [
    {
      "id": "alerts",
      "enabled": true,
      "url": "https://example.com/hooks",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" },
      "body": {
        "title": "{{title}}",
        "message": "{{message}}",
        "event": "{{eventType}}",
        "payload": "{{payload}}"
      }
    }
  ]
}
```

Placeholders are `{{title}}`, `{{message}}`, `{{eventType}}`, `{{priority}}`, and `{{payload.path.to.value}}`. They are supported in URL, header values, and body strings. An exact placeholder preserves the original JSON type. Unknown placeholders resolve to an empty string (or omitted body property for a whole-value token).

A webhook ID uses letters, digits, `_` or `-`. URLs must use HTTP or HTTPS. Use JSON editing for endpoint creation; `/unipi:notify-settings` shows configured webhooks and toggles their enabled/default-route state. `/unipi:notify-test` tests the configured default routes.

Do not copy credentials into chat responses. Keep config file permissions restricted when headers contain tokens.

## Events

Per-event config uses `{ "enabled": true, "platforms": [] }`. An empty route list inherits `defaultPlatforms`. Built-in events include `workflow_end`, `ralph_loop_end`, `mcp_server_error`, `agent_end`, `agent_settled`, `memory_consolidated`, `session_shutdown`, `ask_user_prompt`, and `permission_request`.

`ask_user_prompt` and `permission_request` are blocking events and can be re-notified until the prompt is answered. `silenceAfterInput` can suppress selected routes after keyboard activity; blocking prompts bypass that suppression.

## Native notifications

Native desktop notifications are enabled by default. Configure `native.enabled`, `native.windowsAppId`, and `native.suppressWhenFocused` in the same config file.
