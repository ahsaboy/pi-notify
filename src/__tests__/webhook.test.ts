import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderWebhookTemplate, sendWebhookNotification } from "../../webhook.ts";
import type { WebhookConfig } from "../../types.ts";

describe("webhook templates", () => {
  const context = {
    title: "Build finished",
    message: "2 tests failed",
    eventType: "workflow_end",
    priority: "high",
    payload: { success: false, count: 2, details: { branch: "main" } },
  };

  it("renders strings recursively and preserves exact-token value types", () => {
    assert.deepEqual(renderWebhookTemplate({
      title: "{{ title }}",
      text: "{{message}} ({{payload.count}})",
      success: "{{payload.success}}",
      nested: ["{{payload.details.branch}}", "{{missing}}"],
    }, context), {
      title: "Build finished",
      text: "2 tests failed (2)",
      success: false,
      nested: ["main", undefined],
    });
  });

  it("sends a JSON POST with interpolated URL and headers", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const webhook: WebhookConfig = {
      id: "alerts",
      enabled: true,
      url: "https://hooks.example/{{eventType}}",
      headers: { authorization: "Bearer {{payload.details.branch}}" },
      body: { text: "{{message}}", count: "{{payload.count}}" },
    };
    await sendWebhookNotification(webhook, context, async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response("ok", { status: 200 });
    });
    assert.equal(requestUrl, "https://hooks.example/workflow_end");
    assert.equal(requestInit?.method, "POST");
    assert.deepEqual(requestInit?.headers, {
      "content-type": "application/json",
      authorization: "Bearer main",
    });
    assert.deepEqual(JSON.parse(String(requestInit?.body)), { text: "2 tests failed", count: 2 });
  });

  it("rejects non-HTTP URLs after template rendering", async () => {
    const webhook: WebhookConfig = {
      id: "alerts",
      enabled: true,
      url: "javascript:alert(1)",
      headers: {},
    };
    await assert.rejects(
      sendWebhookNotification(webhook, context, async () => new Response("unexpected")),
      /URL must use HTTP or HTTPS/,
    );
  });

  it("uses the configured method and rejects non-2xx responses", async () => {
    const webhook: WebhookConfig = { id: "alerts", enabled: true, url: "https://hooks.example", headers: {}, method: "PUT" };
    await assert.rejects(
      sendWebhookNotification(webhook, context, async (_url, init) => {
        assert.equal(init?.method, "PUT");
        return new Response("denied", { status: 403 });
      }),
      /HTTP webhook alerts failed \(403\): denied/,
    );
  });
});
