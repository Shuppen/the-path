# LiveOps Playbook — The Path (8-week Horizon)

## Guiding Principles
- **Fair progression**: Cosmetic monetization only; gameplay advantages remain earnable via play.
- **Reward loops**: Daily/weekly missions, battle pass XP, and ad rewards reinforce regular play without fatigue.
- **Community momentum**: Shareable clips, seasonal themes, and collaborative events fuel organic discovery.

## Weekly Cadence Overview
| Week | Theme | Key Updates | Monetization Beat | Events & Missions | Comms & Social |
| ---- | ----- | ----------- | ----------------- | ----------------- | -------------- |
| 1 | Neon Awakening | Launch battle pass Season 1, store soft launch | Starter Pack spotlight, skin & effect bundles | Daily "Warm-up" (3 clears), Weekly "Perfect Chain" | Blog + trailer, share clip contest kickoff |
| 2 | Echo Drift | New track bundle (synthwave), challenge leaderboard reset | Currency Boost ad bonus (+25%) via remote config | Daily "Combo Builder", Weekly "Score Surge" | Social showcase of top clips |
| 3 | Prism Break | Limited cosmetic: "Prismatic Trail" effect | Premium battle pass reminder push | Daily "Fever Trigger", Weekly "Cosmetic Hunt" | Community AMA livestream |
| 4 | Gravity Flux | Mid-season event: "Flux Gauntlet" (harder mode modifier) | Bundle discount on themes | Daily "Flux Runs" (2 endless clears), Weekly "Gauntlet Rank" | Highlight reel of Flux runs |
| 5 | Aurora Rise | New track "Aurora Skies" (free lane reward) | Currency packs tuning (RC bump to 180 coins/ad) | Daily "Chain Builder", Weekly "XP Chase" | Creator partnership sharing presets |
| 6 | Pulse Forge | Forge cosmetics (skins reskinned) rotate into store | Battle pass double XP weekend toggle | Daily "Forge Tasks", Weekly "Upgrade Master" | Spotlight best fan art |
| 7 | Nightfall Remix | Challenge variant with remixed charts | Unlock track session ads boosted (freq +1) | Daily "Remix Warm-up", Weekly "Leaderboard Clash" | Publish remix playlist |
| 8 | Season Finale | Season wrap questline, announce next season teaser | Premium upsell (20% off) | Daily "Final Push", Weekly "Season Sunset" | Season recap video & roadmap |

## Daily Checklist
- Review analytics dashboard: session_start/end, ad_reward, share_export, retention cohorts.
- Verify rewarded ad caps reset (remote overrides if anomalies).
- Monitor challenge completion rates; adjust remote_config if targets too high/low.
- Curate top share exports for social amplification.

## Remote Config Strategy
- **Ads**: Adjust `rewardAmounts.currencyBoost` and placement frequency for weekend boosts.
- **Store**: Time-limited discounts via `store.prices` overrides (apply patch with higher discount percent).
- **Missions**: Scale goals/rewards seasonally; e.g., Week 4 flux event reduces daily goal to 2 to respect higher difficulty.

## Content Production Timeline
- **One week prior** to each thematic beat, finalize cosmetics, QA store bundles, prep comms copy.
- **Two weeks prior** to season change, freeze reward tables, localize headlines, and run regression on battle pass sync.

## Tooling & Ops Notes
- Utilize `remote_config.json` hotfix patches (no redeploy) for: ad caps, coin payouts, mission goal tuning.
- Battle pass & challenge states auto-sync with remote config—schedule config publish 12h before go-live.
- Ensure `ReplayClipExporter` presets updated alongside marketing beats (stickers/titles per theme).
- Maintain fallback for offline analytics buffering; export logs weekly for BI ingestion.

## KPI Targets
- D1 retention ≥ 38%, D7 ≥ 12% (tracked via analytics service).
- Rewarded ad opt-in rate ≥ 25% of daily active users, average 1.6 completions per user.
- Clip export usage ≥ 8% of sessions, with ≥ 20% containing shared link indicator.

Stay agile: review performance every Monday, adjust upcoming beats via remote config and content swaps without client updates.
