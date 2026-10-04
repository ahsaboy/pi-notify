/**
 * Test: loadConfig() must return a deep copy of the defaults.
 *
 * Regression: the no-file path used `return { ...DEFAULT_CONFIG }` (shallow),
 * so nested objects (events, native, silenceAfterInput, …) were shared with
 * the module-level DEFAULT_CONFIG. Mutating a loaded config — e.g. toggling
 * rows in the settings overlay and then pressing Esc — leaked into every
 * later loadConfig() call. Caught by the PR #33 TUI test suite.
 */

import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_CONFIG, loadConfig, saveConfig, validateConfig } from "../../settings.ts";
import type { NotifyConfig } from "../../types.ts";

const REAL_HOME = process.env.HOME;
const REAL_USERPROFILE = process.env.USERPROFILE;
let home = "";

function freshHome(): string {
  if (home) rmSync(home, { recursive: true, force: true });
  home = mkdtempSync(join(tmpdir(), "notify-settings-test-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return home;
}

after(() => {
  if (home) rmSync(home, { recursive: true, force: true });
  if (REAL_HOME) process.env.HOME = REAL_HOME;
  else delete process.env.HOME;
  if (REAL_USERPROFILE) process.env.USERPROFILE = REAL_USERPROFILE;
  else delete process.env.USERPROFILE;
});

describe("webhook config validation", () => {
  it("accepts valid HTTP endpoints and rejects invalid IDs, duplicate IDs, and protocols", () => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.webhooks = [
      { id: "alerts", enabled: true, url: "https://example.com/hook", headers: {} },
      { id: "alerts", enabled: true, url: "file:///tmp/hook", headers: {} },
      { id: "bad id", enabled: false, url: "not a URL", headers: {} },
    ];
    assert.deepEqual(validateConfig(config), [
      "Webhook id must be unique: alerts",
      "Webhook alerts: url must use HTTP or HTTPS",
      "Webhook id must contain only letters, numbers, _ or -: bad id",
      "Webhook bad id: url must be a valid HTTP URL",
    ]);
  });
});

describe("loadConfig deep copy", () => {
  beforeEach(() => {
    freshHome();
  });

  it("no-file path: mutating the result does not pollute later loads", () => {
    const config = loadConfig();
    config.silenceAfterInput.platforms.push("webhook:build-alerts");
    config.silenceAfterInput.enabled = true;
    config.native.enabled = false;
    config.events.permission_request.enabled = true;
    config.events.permission_request.platforms.push("webhook:build-alerts");

    const reloaded = loadConfig();
    assert.deepEqual(reloaded.silenceAfterInput.platforms, ["native"]);
    assert.equal(reloaded.silenceAfterInput.enabled, false);
    assert.equal(reloaded.native.enabled, true);
    assert.equal(reloaded.events.permission_request.enabled, false);
    assert.deepEqual(reloaded.events.permission_request.platforms, []);
  });

  it("no-file path: DEFAULT_CONFIG itself is never handed out by reference", () => {
    const config = loadConfig();
    assert.notEqual(config, DEFAULT_CONFIG);
    assert.notEqual(config.events, DEFAULT_CONFIG.events);
    assert.notEqual(config.silenceAfterInput, DEFAULT_CONFIG.silenceAfterInput);
    config.events.workflow_end.enabled = false;
    assert.equal(DEFAULT_CONFIG.events.workflow_end.enabled, true);
  });

  it("merge path: nested objects from a partial file do not share with defaults", () => {
    const dir = join(home, ".unipi", "config", "notify");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({ native: { enabled: true } } satisfies Partial<NotifyConfig>),
    );

    const config = loadConfig();
    assert.equal(config.native.enabled, true);
    config.events.workflow_end.enabled = false;
    config.recap.enabled = true;

    const reloaded = loadConfig();
    assert.equal(reloaded.events.workflow_end.enabled, true);
    assert.equal(reloaded.recap.enabled, false);
    assert.deepEqual(reloaded.silenceAfterInput.platforms, ["native"]);
  });

  it("save then load round-trips without cross-contamination", () => {
    const config = loadConfig();
    config.webhooks.push({ id: "alerts", enabled: true, url: "https://example.com/hook", headers: {}, body: { message: "{{message}}" } });
    saveConfig(config);
    config.webhooks[0]!.enabled = false;

    const reloaded = loadConfig();
    assert.equal(reloaded.webhooks[0]?.enabled, true);
  });
});
