# Divergent Deceptive Competence Dashboard

An interactive dashboard for exploring human and generative-language-model rewrites of truthful and deceptive statements. Built with React, TypeScript, Vite, and Papa Parse.

## What you can explore

- **Attack Effectiveness:** Compare the best attempts in each attack sequence by attack direction and attacker. Select a point to inspect the modifications
- **Attack Trajectories:** Step through individual human or model attack attempts, following classifier confidence and highlighted text changes.
- **Comparing Attacks:** Compare human and model rewrites of the same original statement; optionally show every attempt instead of just the best attempt.
- **What Attackers Changed / Cue Explorer:** Compare changes in 30 linguistic features by attacker and original veracity, and inspect ranked original/rewrite examples.

## Run locally

From this `dashboard/` directory, use Node.js 22.13+ (or 24+) and npm:

```bash
npm ci
npm run dev
```

Open the URL printed by Vite. To check a production build locally:

```bash
npm run build
npm run preview
```

The build output goes to `dist/`; it and `node_modules/` are ignored by Git. Run `npm run lint` to check the source with ESLint.
