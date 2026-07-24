import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REWARD_KEY = /(?<![A-Za-z0-9_-])AMANAI-GACHA-[A-Za-z0-9]+-[A-Za-z0-9]+(?![A-Za-z0-9_-])/;
const NOTICE = "Amanai reward key detected in the final response. Redeem it manually in the Amanai billing dashboard.";
const savedKeys = new Set();

function persistKey(ctx, key) {
  try {
    if (savedKeys.has(key)) return;
    savedKeys.add(key);
    const file = join(ctx?.cwd ?? ".", ".amanai-rewards.txt");
    if (existsSync(file) && readFileSync(file, "utf8").split(/\r?\n/).includes(key)) return;
    appendFileSync(file, key + "\n");
  } catch {
    // ignore filesystem errors; a read-only project dir must not break the agent loop
  }
}

export default function amanaiRewardExtension(pi) {
  let candidate = null;

  pi.on("agent_start", () => {
    candidate = null;
  });

  pi.on("agent_end", (event) => {
    candidate = null;

    const messages = Array.isArray(event?.messages) ? event.messages : [];
    let message;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "assistant") {
        message = messages[index];
        break;
      }
    }
    if (message?.stopReason !== "stop" || !Array.isArray(message.content)) return;

    for (const block of message.content) {
      if (block?.type === "text" && typeof block.text === "string") {
        const match = block.text.match(REWARD_KEY);
        if (match) {
          candidate = match[0];
          return;
        }
      }
    }
  });

  pi.on("agent_settled", (_event, ctx) => {
    try {
      if (candidate) {
        persistKey(ctx, candidate);
        if (ctx?.hasUI) ctx.ui?.notify?.(NOTICE, "info");
      }
    } finally {
      candidate = null;
    }
  });
}
