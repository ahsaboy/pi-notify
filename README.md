# pi-notify

Repository: https://github.com/ahsaboy/pi-notify

Pi notifications with native desktop delivery and user-defined HTTP webhooks. Configure any HTTP endpoint with its own URL, headers, method, and JSON body template instead of depending on a provider-specific integration.

## Configuration

Configuration is stored at `~/.unipi/config/notify/config.json`:

```json
{
  "defaultPlatforms": ["webhook:team-chat", "native"],
  "webhooks": [
    {
      "id": "team-chat",
      "enabled": true,
      "url": "https://example.com/hooks/{{payload.channel}}",
      "method": "POST",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN",
        "X-Notification-Event": "{{eventType}}"
      },
      "body": {
        "text": "{{title}}: {{message}}",
        "event": "{{eventType}}",
        "priority": "{{priority}}",
        "data": "{{payload}}"
      }
    }
  ],
  "events": {
    "workflow_end": { "enabled": true, "platforms": [] }
  }
}
```

Webhook IDs may contain letters, numbers, `_` and `-`. Route them as `webhook:<id>` in `defaultPlatforms`, an event's `platforms`, the `notify_user` tool's optional `platforms`, or `silenceAfterInput.platforms`. An empty event-level `platforms` list inherits `defaultPlatforms`. Webhooks are disabled until `enabled` is true and the route is selected.

The request defaults to `POST` with `Content-Type: application/json`. `headers` is a string map. `body` can be any JSON-compatible value; if omitted, the request body is `{ "title": "{{title}}", "message": "{{message}}" }`. Configure credentials in headers, and keep the config file private.

### Placeholders

Placeholders use `{{name}}` syntax and are rendered recursively in URL, headers, and body strings. Supported context fields:

| Placeholder | Value |
|---|---|
| `{{title}}` | Notification title |
| `{{message}}` | Formatted notification message |
| `{{eventType}}` | Event key, such as `workflow_end` or `agent_tool` |
| `{{priority}}` | Priority when supplied (`low`, `normal`, or `high`) |
| `{{payload}}` | Original event payload |
| `{{payload.someField}}` | Nested event payload property |

A string containing only a placeholder preserves the value's JSON type. For example, `"count": "{{payload.count}}"` becomes a JSON number when `count` is numeric. A placeholder embedded in other text is converted to a string. Unknown placeholders embedded in text become an empty string. A whole-value placeholder resolves to `undefined`; JSON serialization omits object properties and encodes array entries as `null`.

## Events and commands

The package subscribes to Pi lifecycle events and supports per-event enable switches. Built-in events include workflow and Ralph completion, MCP errors, agent completion, session shutdown, ask-user prompts, and permission prompts. Blocking prompts can be re-sent until answered.

- `/unipi:notify-settings` opens the settings overlay. Add webhook definitions by editing the JSON config; the overlay lists configured endpoints so they can be enabled and routed. In the Events tab, select an event and press `P` to edit its platform routes; press `R` to restore global defaults.
- `/unipi:notify-test` sends a test through the configured default routes.
- `/unipi:notify-event <event> <on|off>` toggles an event.
- `notify_user` sends an ad-hoc notification.

Native notifications are enabled by default. Set `native.enabled` to `false` to disable them.

## Install With Pi

Try the package for one invocation without changing Pi settings:

```powershell
pi -e https://github.com/ahsaboy/pi-notify
```

Install it persistently for your user:

```powershell
pi install https://github.com/ahsaboy/pi-notify
```

## Development

```sh
npm install
npm test
```

The package is standalone; it does not require the UniPi monorepo checkout. `@pi-unipi/core` supplies shared Pi/UniPi event constants and UI utilities.

## License

MIT
