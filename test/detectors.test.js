import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import ompExtension from "../extensions/amanai-reward/index.js";
import piExtension from "../extensions/amanai-reward/pi.js";

const NOTICE = "Amanai reward key detected in the final response. Redeem it manually in the Amanai billing dashboard.";
const KEY = "AMANAI-GACHA-Alpha9-Reward42";

function install(extension) {
  const handlers = new Map();
  const registrations = [];
  extension({
    on(event, handler) {
      registrations.push(event);
      handlers.set(event, handler);
    },
  });
  return { handlers, registrations };
}

function finalAssistant(content, stopReason = "stop") {
  return { messages: [{ role: "assistant", stopReason, content }] };
}

function notificationContext(hasUI = true, cwd) {
  const notifications = [];
  return {
    notifications,
    ctx: {
      hasUI,
      cwd,
      ui: { notify(message, level) { notifications.push([message, level]); } },
    },
  };
}

function tempContext(hasUI = true) {
  const dir = mkdtempSync(join(tmpdir(), "amanai-test-"));
  const { ctx, notifications } = notificationContext(hasUI, dir);
  return { ctx, notifications, file: join(dir, ".amanai-rewards.txt"), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function frozen(event) {
  return Object.freeze({
    ...event,
    messages: Object.freeze(event.messages?.map((message) => Object.freeze({
      ...message,
      content: Array.isArray(message.content) ? Object.freeze(message.content.map((block) => Object.freeze({ ...block }))) : message.content,
    }))),
  });
}

test("OMP detects a standalone key only in the final successful assistant response without mutation", (t) => {
  const { handlers, registrations } = install(ompExtension);
  assert.deepEqual(registrations, ["agent_end"]);
  const { ctx, notifications, cleanup } = tempContext();
  t.after(cleanup);
  const event = frozen(finalAssistant([{ type: "text", text: `Reward: ${KEY}` }]));
  const before = JSON.stringify(event);

  handlers.get("agent_end")(event, ctx);

  assert.deepEqual(notifications, [[NOTICE, "info"]]);
  assert.equal(JSON.stringify(event), before);
});

test("OMP skips continued, invalid, non-text, nonmatching, and non-final candidates without mutation", () => {
  const { handlers } = install(ompExtension);
  const cases = [
    { ...finalAssistant([{ type: "text", text: KEY }]), willContinue: true },
    {},
    finalAssistant([{ type: "text", text: KEY }], "length"),
    finalAssistant([{ type: "toolCall", id: KEY }]),
    finalAssistant([{ type: "text", text: `x${KEY}_suffix` }]),
    {
      messages: [
        { role: "assistant", stopReason: "stop", content: [{ type: "text", text: KEY }] },
        { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "No reward." }] },
      ],
    },
  ];

  for (const input of cases) {
    const event = frozen(input);
    const before = JSON.stringify(event);
    const { ctx, notifications } = notificationContext();
    handlers.get("agent_end")(event, ctx);
    assert.deepEqual(notifications, []);
    assert.equal(JSON.stringify(event), before);
  }
});

test("Pi defers one matching candidate until settlement, then clears it without mutation", (t) => {
  const { handlers, registrations } = install(piExtension);
  assert.deepEqual(registrations, ["agent_start", "agent_end", "agent_settled"]);
  const { ctx, notifications, cleanup } = tempContext();
  t.after(cleanup);
  const event = frozen(finalAssistant([{ type: "text", text: `Reward: ${KEY}` }]));
  const before = JSON.stringify(event);

  handlers.get("agent_end")(event, ctx);
  assert.deepEqual(notifications, []);
  assert.equal(JSON.stringify(event), before);

  handlers.get("agent_settled")({}, ctx);
  handlers.get("agent_settled")({}, ctx);
  assert.deepEqual(notifications, [[NOTICE, "info"]]);
});

test("Pi clears stale candidates at start and before each collection", () => {
  const { handlers } = install(piExtension);
  const { ctx, notifications } = notificationContext();
  const matching = frozen(finalAssistant([{ type: "text", text: KEY }]));
  const noMatch = frozen(finalAssistant([{ type: "text", text: "No reward." }]));

  handlers.get("agent_end")(matching, ctx);
  handlers.get("agent_start")({}, ctx);
  handlers.get("agent_settled")({}, ctx);

  handlers.get("agent_end")(matching, ctx);
  handlers.get("agent_end")(noMatch, ctx);
  handlers.get("agent_settled")({}, ctx);

  assert.deepEqual(notifications, []);
});

test("Pi rejects no-UI, non-stop, and non-text candidates without mutation", () => {
  const { handlers } = install(piExtension);
  const cases = [
    { event: finalAssistant([{ type: "text", text: KEY }]), hasUI: false },
    { event: finalAssistant([{ type: "text", text: KEY }], "length"), hasUI: true },
    { event: finalAssistant([{ type: "toolCall", id: KEY }]), hasUI: true },
  ];

  for (const { event: input, hasUI } of cases) {
    const event = frozen(input);
    const before = JSON.stringify(event);
    const { ctx, notifications } = notificationContext(hasUI);
    handlers.get("agent_end")(event, ctx);
    handlers.get("agent_settled")({}, ctx);
    handlers.get("agent_settled")({}, notificationContext(true).ctx);
    assert.deepEqual(notifications, []);
    assert.equal(JSON.stringify(event), before);
  }
});

test("OMP persists the detected key and still notifies", () => {
  const key = "AMANAI-GACHA-Bravo1-Persist1";
  const { handlers } = install(ompExtension);
  const { ctx, notifications, file, cleanup } = tempContext();
  try {
    handlers.get("agent_end")(frozen(finalAssistant([{ type: "text", text: `Reward: ${key}` }])), ctx);
    assert.equal(readFileSync(file, "utf8"), `${key}\n`);
    assert.deepEqual(notifications, [[NOTICE, "info"]]);
  } finally {
    cleanup();
  }
});

test("OMP does not append a repeated detection of the same key", () => {
  const key = "AMANAI-GACHA-Charlie2-Persist2";
  const { handlers } = install(ompExtension);
  const { ctx, notifications, file, cleanup } = tempContext();
  try {
    const event = () => frozen(finalAssistant([{ type: "text", text: `Reward: ${key}` }]));
    handlers.get("agent_end")(event(), ctx);
    handlers.get("agent_end")(event(), ctx);
    assert.equal(readFileSync(file, "utf8"), `${key}\n`);
    assert.deepEqual(notifications, [[NOTICE, "info"], [NOTICE, "info"]]);
  } finally {
    cleanup();
  }
});

test("OMP creates no file when nothing matches", () => {
  const { handlers } = install(ompExtension);
  const { ctx, notifications, file, cleanup } = tempContext();
  try {
    handlers.get("agent_end")(frozen(finalAssistant([{ type: "text", text: "No reward." }])), ctx);
    assert.equal(existsSync(file), false);
    assert.deepEqual(notifications, []);
  } finally {
    cleanup();
  }
});

test("OMP does not append a key already present in the file", () => {
  const key = "AMANAI-GACHA-Delta3-Persist4";
  const { handlers } = install(ompExtension);
  const { ctx, notifications, file, cleanup } = tempContext();
  try {
    writeFileSync(file, `${key}\n`);
    handlers.get("agent_end")(frozen(finalAssistant([{ type: "text", text: `Reward: ${key}` }])), ctx);
    assert.equal(readFileSync(file, "utf8"), `${key}\n`);
    assert.deepEqual(notifications, [[NOTICE, "info"]]);
  } finally {
    cleanup();
  }
});

test("Pi writes nothing at agent_end and persists with the notification at agent_settled", () => {
  const key = "AMANAI-GACHA-Echo4-Persist5";
  const { handlers } = install(piExtension);
  const { ctx, notifications, file, cleanup } = tempContext();
  try {
    handlers.get("agent_end")(frozen(finalAssistant([{ type: "text", text: `Reward: ${key}` }])), ctx);
    assert.equal(existsSync(file), false);
    assert.deepEqual(notifications, []);

    handlers.get("agent_settled")({}, ctx);
    assert.equal(readFileSync(file, "utf8"), `${key}\n`);
    assert.deepEqual(notifications, [[NOTICE, "info"]]);
  } finally {
    cleanup();
  }
});

test("Pi creates no file when there is no candidate", () => {
  const { handlers } = install(piExtension);
  const { ctx, notifications, file, cleanup } = tempContext();
  try {
    handlers.get("agent_end")(frozen(finalAssistant([{ type: "text", text: "No reward." }])), ctx);
    handlers.get("agent_settled")({}, ctx);
    assert.equal(existsSync(file), false);
    assert.deepEqual(notifications, []);
  } finally {
    cleanup();
  }
});
