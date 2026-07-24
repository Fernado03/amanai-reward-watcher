# Amanai Reward Watcher for Pi

A dependency-free, passive Pi extension that watches completed assistant responses for a standalone `AMANAI-GACHA-<alphanumeric>-<alphanumeric>` footer and shows a generic local notification when one is present.

## How it works

- **Oh My Pi:** observes `agent_end` only after the response will not continue, then inspects the most recent successful assistant response.
- **Original Pi:** collects a candidate at `agent_end` and delivers the notification at `agent_settled`.

The watcher only detects a footer already present in a final response. It does not make rewards likely, free, or available.

## Safety limits

This package never makes network requests, navigates a browser or UI, uses credentials, stores or logs tokens, changes responses, farms requests, or redeems anything automatically. A notification is local only; any redemption is a deliberate manual action outside this package.

## Local development

```sh
npm run check
npm test
npm pack --dry-run
```

## License

[MIT](LICENSE)
