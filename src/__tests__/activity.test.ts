import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterPlatformsAfterInput, mergeSilenceAfterInput, noteInput, resetInputActivity } from "../../activity.ts";
import type { NotifyPlatform, SilenceAfterInputConfig } from "../../types.ts";

const DEFAULTS: SilenceAfterInputConfig = { enabled: true, windowMs: 10000, platforms: ["native"] };
const ALL: NotifyPlatform[] = ["native", "webhook:alerts", "webhook:deploy"];
const config = (partial?: Partial<SilenceAfterInputConfig>) => ({ silenceAfterInput: mergeSilenceAfterInput(partial, DEFAULTS) });

describe("silence after input", () => {
  beforeEach(resetInputActivity);

  it("does not silence before a keypress", () => {
    assert.deepEqual(filterPlatformsAfterInput(ALL, config(), 1000), { send: ALL, silenced: [] });
  });

  it("silences listed routes inside the window", () => {
    noteInput(1000);
    assert.deepEqual(filterPlatformsAfterInput(ALL, config(), 1100), {
      send: ["webhook:alerts", "webhook:deploy"], silenced: ["native"],
    });
  });

  it("filters native and webhooks independently", () => {
    noteInput(1000);
    assert.deepEqual(filterPlatformsAfterInput(ALL, config({ platforms: ["native", "webhook:deploy"] }), 1100), {
      send: ["webhook:alerts"], silenced: ["native", "webhook:deploy"],
    });
  });

  it("stops silencing after the window and does nothing when disabled", () => {
    noteInput(1000);
    assert.deepEqual(filterPlatformsAfterInput(ALL, config(), 11000), { send: ALL, silenced: [] });
    assert.deepEqual(filterPlatformsAfterInput(ALL, config({ enabled: false }), 1100), { send: ALL, silenced: [] });
  });

  it("silences all routes when the list is empty", () => {
    noteInput(1000);
    assert.deepEqual(filterPlatformsAfterInput(ALL, config({ platforms: [] }), 1100), { send: [], silenced: ALL });
  });

  it("preserves an explicit empty list and uses defaults when missing", () => {
    assert.deepEqual(mergeSilenceAfterInput({ platforms: [] }, DEFAULTS).platforms, []);
    assert.deepEqual(mergeSilenceAfterInput(undefined, DEFAULTS), DEFAULTS);
  });

  it("falls back on invalid window values and drops invalid routes", () => {
    const merged = mergeSilenceAfterInput({ enabled: false, windowMs: -1, platforms: ["native", "webhook:valid", "webhook:bad id"] }, DEFAULTS);
    assert.equal(merged.enabled, false);
    assert.equal(merged.windowMs, DEFAULTS.windowMs);
    assert.deepEqual(merged.platforms, ["native", "webhook:valid"]);
  });

  it("lets blocking events through and silences other events", () => {
    noteInput(1000);
    for (const eventType of ["ask_user_prompt", "permission_request"]) {
      assert.deepEqual(filterPlatformsAfterInput(ALL, config({ platforms: [] }), 1100, eventType), { send: ALL, silenced: [] });
    }
    assert.deepEqual(filterPlatformsAfterInput(ALL, config(), 1100, "agent_end"), {
      send: ["webhook:alerts", "webhook:deploy"], silenced: ["native"],
    });
  });
});
