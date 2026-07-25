# Amanai Reward Watcher for Pi

A dependency-free, passive Pi extension that watches completed assistant responses for a standalone `AMANAI-GACHA-<alphanumeric>-<alphanumeric>` footer and shows a generic local notification when one is present.

## How it works

- **Oh My Pi:** observes `agent_end` only after the response will not continue, then inspects the most recent successful assistant response.
- **Original Pi:** collects a candidate at `agent_end` and delivers the notification at `agent_settled`.
- Detected keys are appended, one per line, to `.amanai-rewards.txt` in the current project directory, deduplicated. Add `.amanai-rewards.txt` to your project's `.gitignore` so keys are not committed.

The watcher only detects a footer already present in a final response. It does not make rewards likely, free, or available.

## Installation

The package is published to npm, so both harnesses can install it directly.

### Oh My Pi

```sh
omp plugin install amanai-reward-watcher
```

Then restart OMP. The plugin loader reads the `omp.extensions` manifest and loads the adapter.

#### Manual alternative

From a clone of this repository, copy the OMP adapter into your OMP user extensions:

```powershell
mkdir "$env:USERPROFILE\.omp\agent\extensions\amanai-reward"
copy "extensions\amanai-reward\index.js" "$env:USERPROFILE\.omp\agent\extensions\amanai-reward\index.js"
```

macOS/Linux:

```sh
mkdir -p ~/.omp/agent/extensions/amanai-reward
cp extensions/amanai-reward/index.js ~/.omp/agent/extensions/amanai-reward/index.js
```

Then restart OMP. It auto-discovers one-level extension directories under `~/.omp/agent/extensions`.

### Original Pi

```sh
pi install npm:amanai-reward-watcher
```

Pi reads the package's `pi.extensions` manifest and loads the Pi-native adapter.

#### Local clone alternative

```sh
git clone https://github.com/Fernado03/amanai-reward-watcher.git
pi install ./amanai-reward-watcher
```

## Updating

### Oh My Pi

This package is installed directly from npm, not from an OMP marketplace. Force-install the same package name to replace the installed copy with the latest published version:

```sh
omp plugin install amanai-reward-watcher --force
```

Then restart OMP. `omp plugin upgrade` is for marketplace plugin IDs such as `name@marketplace`, so it does not apply to this package.

### Original Pi

```sh
pi update npm:amanai-reward-watcher
```

## Safety limits

This package never makes network requests, navigates a browser or UI, uses credentials, changes responses, farms requests, or redeems anything automatically. Detected keys are stored only in the local project's `.amanai-rewards.txt` file; a notification is local only and never contains the key, and any redemption is a deliberate manual action outside this package.

## Local development

```sh
npm run check
npm test
npm pack --dry-run
```

## License

[MIT](LICENSE)
