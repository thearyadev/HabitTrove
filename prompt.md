# HabitTrove Bulk Edit JSON Generator

You are generating a JSON payload for the **HabitTrove** bulk import/sync system. HabitTrove is a gamified habit tracker where users earn coins for completing habits/tasks and spend coins on rewards. Your job is to produce a valid JSON document that defines the user's habits, tasks, and rewards catalog.

## System Concepts

- **Habits** are recurring activities (e.g., "Read 30 minutes", "Exercise"). They repeat on a schedule and award coins each time they're completed.
- **Tasks** are one-off to-dos with a due date (e.g., "Finish report", "Clean garage"). They award coins once when completed.
- **Rewards** are things the user can spend their earned coins on (e.g., "Movie night = 50 coins"). Rewards can have multiple tiers (e.g., small/medium/large portions) and optional redemption limits per time window.
- **Coins** are the currency. Every habit/task has a `coinReward` — the number of coins earned per completion. Every reward tier has a `coinCost` — the price to redeem it. The system is designed so that the coin values create a balanced economy: harder/more valuable habits earn more, and more desirable rewards cost more.

## JSON Schema

The root object must conform to this structure:

```json
{
  "schemaVersion": 2,
  "exportedAt": "2026-04-18T12:00:00.000Z",
  "habits": [],
  "tasks": [],
  "rewards": []
}
```

- `schemaVersion` — **required**, must be exactly `2`.
- `exportedAt` — optional, ISO 8601 datetime string (e.g., `"2026-04-18T12:00:00.000Z"`). Set it to the current time.
- `habits` — array of habit objects (recurring activities).
- `tasks` — array of task objects (one-off to-dos with due dates). Uses the same schema as habits.
- `rewards` — array of reward objects.

### Sync Behavior

When this JSON is imported, the system performs a **sync**:

- Items **with an `id`** that matches an existing record will be **updated** in place.
- Items **without an `id`** will be **created as new** records (the system assigns a UUID).
- Existing records whose `id` is **not present** in the imported JSON will be **soft-deleted** (archived).
- Past completion history and coin transactions are **never modified or deleted** by this sync.

**Therefore:** If you want to add new items without affecting existing ones, include all existing items (with their `id`s) alongside the new ones. If you want to replace the entire catalog, omit `id`s from all items and the old ones will be archived.

---

## Habit / Task Schema

Habits and tasks share the same schema. The difference is which array they are placed in and how `frequency` works.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | optional | — | Omit for new items. Include to update an existing item. Must be unique across both `habits` and `tasks` arrays. |
| `name` | string | **required** | — | Display name. Min 1 character. |
| `description` | string | optional | `""` | Longer description. |
| `frequency` | string | **required** | — | For **habits**: an RRule string (see Frequency Formats below). For **tasks**: an ISO 8601 datetime string representing the due date. |
| `coinReward` | integer | **required** | — | Coins earned per completion. Must be 1–9999. For quantity habits, this serves as a display value; the actual calculation uses the quantity formula. |
| `trackingMode` | string | optional | `"standard"` | Either `"standard"` or `"quantity"`. Standard = one completion = flat coinReward. Quantity = coins scale with the amount done (e.g., per km, per page). |
| `quantityUnit` | string | conditional | — | **Required when trackingMode is `"quantity"`**. The unit of measurement (e.g., `"km"`, `"pages"`, `"minutes"`, `"glasses"`). |
| `baseRate` | number | conditional | — | **Required when trackingMode is `"quantity"`**. Coins awarded per `baseUnit` of the activity. E.g., if baseRate=2 and baseUnit=1, you earn 2 coins per 1 unit. Must be positive. |
| `baseUnit` | number | conditional | — | **Required when trackingMode is `"quantity"`**. The quantity increment that earns `baseRate` coins. E.g., baseUnit=5 means every 5 units earns baseRate coins. Must be positive. |
| `bonusThreshold` | number | conditional | — | **Required when trackingMode is `"quantity"`**. Quantity threshold above which the `scaleFactor` bonus kicks in. E.g., bonusThreshold=10 means bonus applies when quantity > 10. Must be positive. |
| `scaleFactor` | number | conditional | — | **Required when trackingMode is `"quantity"`**. Multiplier applied to coins when quantity exceeds `bonusThreshold`. Must be > 1. E.g., scaleFactor=1.5 means 50% bonus coins above threshold. |
| `targetCompletions` | integer | optional | — | Number of times the habit must be completed per period to be "done". Must be >= 1. Useful for habits like "Drink 8 glasses of water". |
| `archived` | boolean | optional | `false` | If true, the item is archived and hidden from active lists. |
| `pinned` | boolean | optional | `false` | If true, the item is pinned to the top of its list. |

### Quantity Coin Formula

For `trackingMode: "quantity"`, coins earned for a given quantity `q` are calculated as:

```
baseCoins = (q / baseUnit) * baseRate
if q > bonusThreshold:
    coins = baseCoins * scaleFactor
else:
    coins = baseCoins
final = roundToInteger(coins)
```

**Example:** Running with baseRate=2, baseUnit=1, bonusThreshold=10, scaleFactor=1.5:
- Run 5 km → (5/1) * 2 = 10 coins
- Run 15 km → (15/1) * 2 * 1.5 = 45 coins

---

## Frequency Formats

### For Habits (recurring)

Habits use **RRule** recurrence rule strings. Common values:

| Frequency | RRule String | Meaning |
|---|---|---|
| Daily | `"FREQ=DAILY"` | Every day |
| Weekly | `"FREQ=WEEKLY"` | Every week (requires day-of-week in full RRule) |
| Monthly | `"FREQ=MONTHLY"` | Every month |
| Yearly | `"FREQ=YEARLY"` | Every year |
| Weekdays | `"FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"` | Monday through Friday |

For simple habits, `"FREQ=DAILY"` is the most common. More complex rules follow the [RRULE spec](https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-recurrence-rule.html), e.g.:
- `"FREQ=WEEKLY;BYDAY=MO,WE,FR"` — every Monday, Wednesday, Friday
- `"FREQ=MONTHLY;BYMONTHDAY=15"` — on the 15th of every month

### For Tasks (one-off)

Tasks use an **ISO 8601 datetime string** as the due date:

```
"2026-04-20T09:00:00.000Z"
```

---

## Reward Schema

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | optional | — | Omit for new, include for update. Must be unique across all rewards. |
| `name` | string | **required** | — | Display name. Min 1 character. |
| `description` | string | optional | `""` | Longer description. |
| `archived` | boolean | optional | `false` | If true, archived and hidden. |
| `link` | string | optional | — | URL for more info (must be a valid URL if provided). |
| `redemptionRule` | object | **required** | — | Controls how often the reward can be redeemed. See below. |
| `tiers` | array | **required** | — | Array of tier objects. Must have at least 1 tier. See below. |

### Redemption Rule

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `window` | string | **required** | — | One of: `"unlimited"`, `"daily"`, `"weekly"`, `"monthly"`. Defines the time window for redemption limits. |
| `maxRedemptions` | integer | conditional | — | **Required when window is not `"unlimited"`**. Max times the reward can be redeemed within the window. Must be >= 1. |

### Reward Tier

Each reward must have at least one tier. Tiers represent different sizes/levels of the reward at different price points.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | string | optional | — | Omit for new tiers. Must be unique within the reward. |
| `name` | string | **required** | — | Tier display name (e.g., "Small", "Medium", "Large"). Min 1 character. |
| `coinCost` | integer | **required** | — | Coins required to redeem this tier. Must be 1–9999. |
| `position` | integer | optional | — | Sort order (0-based). Lower values appear first. |

---

## Complete Example

```json
{
  "schemaVersion": 2,
  "exportedAt": "2026-04-18T12:00:00.000Z",
  "habits": [
    {
      "name": "Morning Meditation",
      "description": "10 minutes of mindfulness",
      "frequency": "FREQ=DAILY",
      "coinReward": 5,
      "pinned": true
    },
    {
      "name": "Read",
      "description": "Read a book",
      "frequency": "FREQ=DAILY",
      "coinReward": 3
    },
    {
      "name": "Running",
      "description": "Track distance run",
      "frequency": "FREQ=DAILY",
      "coinReward": 10,
      "trackingMode": "quantity",
      "quantityUnit": "km",
      "baseRate": 2,
      "baseUnit": 1,
      "bonusThreshold": 10,
      "scaleFactor": 1.5
    },
    {
      "name": "Gym",
      "description": "Strength training",
      "frequency": "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      "coinReward": 15
    },
    {
      "name": "Drink Water",
      "description": "Stay hydrated",
      "frequency": "FREQ=DAILY",
      "coinReward": 2,
      "targetCompletions": 8
    }
  ],
  "tasks": [
    {
      "name": "Finish quarterly report",
      "description": "Due for the board meeting",
      "frequency": "2026-04-25T17:00:00.000Z",
      "coinReward": 30
    },
    {
      "name": "Organize desk",
      "frequency": "2026-04-20T10:00:00.000Z",
      "coinReward": 10
    }
  ],
  "rewards": [
    {
      "name": "Coffee Shop",
      "description": "Treat yourself to a coffee",
      "redemptionRule": {
        "window": "daily",
        "maxRedemptions": 1
      },
      "tiers": [
        { "name": "Regular", "coinCost": 10, "position": 0 },
        { "name": "Large", "coinCost": 15, "position": 1 }
      ]
    },
    {
      "name": "Movie Night",
      "description": "Watch a movie of your choice",
      "redemptionRule": {
        "window": "weekly",
        "maxRedemptions": 1
      },
      "tiers": [
        { "name": "Standard", "coinCost": 50 }
      ]
    },
    {
      "name": "Skip a Chore",
      "description": "Pass on one household task today",
      "redemptionRule": {
        "window": "unlimited"
      },
      "tiers": [
        { "name": "One chore", "coinCost": 25 }
      ]
    },
    {
      "name": "Gaming Session",
      "description": "1 hour of guilt-free gaming",
      "redemptionRule": {
        "window": "weekly",
        "maxRedemptions": 2
      },
      "tiers": [
        { "name": "1 Hour", "coinCost": 30, "position": 0 },
        { "name": "2 Hours", "coinCost": 55, "position": 1 }
      ]
    }
  ]
}
```
