# Storage Hunters Scoring Model 1.1 Design

## Goal

Replace the remaining unfairly linear scoring assumptions with the user-approved utility curves while preserving existing gear/history and making old installations migrate automatically.

## Approved model

- Bid Arrow Speed: weight 1.25; full marginal value through 75%; 25% marginal value from 75–90%; flat from 90–100%; above 100% subtract 25% of normal Arrow value per excess percentage point.
- Luck: weight 1.00; marginal values 1.00 from 0–100%, 0.80 from 100–150%, 0.60 from 150–200%, 0.40 from 200–250%, 0.20 above 250%; no cap and no high-Luck penalty.
- Bid Zone Width: weight 0.50; full marginal value 0–30%, 75% from 30–60%, 50% above 60%.
- NPC Offers Bonus: weight 0.35; full marginal value 0–20%, 75% from 20–40%, 50% above 40%.
- Energy Drink Time: unchanged at weight 0.55; full to 50%, 10% marginal value 50–100%, zero above 100%.
- Tip Chance: 0.10.
- Bid Recovery: 0.05.
- Walkspeed: 0.02.
- Vehicle Speed: 0.01.
- Conditional Luck passives (Sunny, Nocturnal, Raindrop, Overcharged) contribute expected Luck into the same total-Luck curve rather than bypassing diminishing returns.

## System behaviour

The optimiser must score complete loadouts using combined totals before applying nonlinear curves. Dominance must use the same piecewise utility functions so discard advice cannot disagree with optimisation. Certificate threshold simulation must re-evaluate the full loadout under the same scoring engine. The Arrow specialist must rank by actual Arrow utility, not raw reduction.

## Migration

Algorithm settings version becomes 1.1. Stored version 1.0 settings are migrated automatically to the approved 1.1 scoring parameters while gear, authentication history, vehicle data and Gavel data remain untouched. Version 1.1 settings remain editable and survive reloads/imports.

## UI

The Settings screen exposes Luck and NPC breakpoints/multipliers alongside existing settings, labels the algorithm as version 1.1, and explains the current Arrow/Luck/Zone/NPC utility curves.
