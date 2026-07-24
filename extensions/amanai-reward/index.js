import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REWARD_KEY = /(?<![A-Za-z0-9_-])AMANAI-GACHA-[A-Za-z0-9]+-[A-Za-z0-9]+(?![A-Za-z0-9_-])/;
const savedKeys = new Set();

function persistKey(ctx, key) {
  if (savedKeys.has(key)) return;
  const path = join(ctx?.cwd ?? ".", ".amanai-rewards.txt");
  if (existsSync(path) && readFileSync(path, "utf8").split(/\r?\n/).includes(key)) {
    savedKeys.add(key);
    return;
  }
  appendFileSync(path, key + "\n");
  savedKeys.add(key);
}
const NOTICE = "Amanai reward key detected in the final response. Redeem it manually in the Amanai billing dashboard.";

export default function amanaiRewardExtension(pi) {
  pi.on("agent_end", (event, ctx) => {
    if (event?.willContinue) return;

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
      if (block?.type === "text" && typeof block.text === "string" && REWARD_KEY.test(block.text)) {
        try {
          persistKey(ctx, block.text.match(REWARD_KEY)[0]);
        } catch {}
        ctx?.ui?.notify?.(NOTICE, "info");
        return;
      }
    }
  });
}
