import assert from "node:assert/strict";
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

function notificationContext(hasUI = true) {
  const notifications = [];
  return {
    notifications,
    ctx: {
      hasUI,
      ui: { notify(message, level) { notifications.push([message, level]); } },
    },
  };
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

test("OMP detects a standalone key only in the final successful assistant response without mutation", () => {
  const { handlers, registrations } = install(ompExtension);
  assert.deepEqual(registrations, ["agent_end"]);
  const { ctx, notifications } = notificationContext();
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

test("Pi defers one matching candidate until settlement, then clears it without mutation", () => {
  const { handlers, registrations } = install(piExtension);
  assert.deepEqual(registrations, ["agent_start", "agent_end", "agent_settled"]);
  const { ctx, notifications } = notificationContext();
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
