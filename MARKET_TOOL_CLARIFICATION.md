# Market Tool Clarification & Arize Improvements

## Problem Identified

**You were confused about Market.tool:**
- ❌ Thought it asked for user input (soil type, crop prices)
- ❌ Didn't understand why it took input and provided suggestions
- ❌ Questions: "What are we doing with market tool? Are we suggesting or taking input?"

## The Truth About Market.tool

✅ **Market.tool is NOT asking for user input** — it's an **internal Gemini tool call**.

### How it works:
1. User enters OPTIONAL `preferredCrop` → just a suggestion override, not market data
2. User clicks "Plan my season"
3. Gemini calls 3 internal tools:
   - **Weather Tool** → fetches live temperature, rainfall, humidity
   - **Soil Tool** → analyzes soil properties for the GPS coordinates
   - **Market Tool** → fetches live **mandi (commodity) prices** to calculate income estimates
4. Agent **suggests** the best crop based on all 3 data sources
5. User gets a plan with income/yield projections

### What "Force Live" does:
When you click **"Force Live"**, it:
- Skips the cache
- Calls Gemini fresh with all 3 tools running in parallel
- Gets fresh weather, soil, AND market prices (mandi rates)
- Returns updated income estimates with current commodity prices

### The Preferred Crop Input:
```
"Preferred crop (optional)" = User's preference override
↓
This tells the agent: "If you're recommending between wheat and rice,
please consider my preference for wheat."
↓
Agent still fetches live market data for both varieties.
The data is SUGGESTIONS, not inputs.
```

---

## UI Improvements Made

### 1. **Arize Insights Component** (`ArizeInsights.tsx`)

**Before:**
- Generic "Quality Check" with vague recommendations
- No clear action items
- Confusing for judges

**After:**
- Clear header: **"💡 How to improve your next plan using Arize"**
- Each eval dimension now shows:
  - 📊 Icon (📊 for groundedness, ✅ for hallucination, etc.)
  - 🎯 Specific hint ("Are estimates backed by live tool data?")
  - 📋 Action items tailored to that dimension
  - 🔵 Quick actions at bottom ("Force Live", "Complete farm profile")

### Example: When "Numbers are Grounded" = 55%

**Old UI:**
```
Data Grounding 55%
To improve scores:
• Complete farm profile with accurate soil type...
• Use Force Live...
• Specify preferred crop...
```

**New UI:**
```
📊 Numbers are Grounded
   "Are estimates backed by live tool data?"     55%

   → Next steps:
   • Click 'Force Live' to fetch fresh weather & market prices
     (the market tool internally calls Gemini to get live mandi rates)
   • Numbers in your plan come from 3 data sources:
     weather tool, soil tool, and market tool (all via Gemini)
   • Ensure your farm GPS coordinates are accurate
```

---

## Code Changes

### 1. **AgentPanel.tsx**
- ✅ Added tooltip explaining "Preferred crop" is an optional suggestion
- ✅ Updated "Force Live" button tooltip to mention mandi prices
- ✅ Clarified progress message: "includes live weather, soil properties, and mandi prices (market tool via Gemini)"

### 2. **ArizeInsights.tsx**
- ✅ New header: "How to improve your next plan using Arize"
- ✅ Added `getIcon()` function for visual indicators
- ✅ Added `getHint()` function for contextual questions
- ✅ Added `getActionItems()` function with tailored suggestions:
  - Each dimension (groundedness, relevance, etc.) has specific next steps
  - Market tool clarified in groundedness suggestions
  - "Preferred crop" clarified in agronomic correctness suggestions

### 3. **Key Messaging**
- "Market tool" → now explained as "internal Gemini tool that fetches mandi prices"
- "Preferred crop" → clarified as optional suggestion, not market data
- "Force Live" → now explained as fetching fresh weather + soil + market prices

---

## What Users See Now

### Before Plan:
```
🤖 Ask the agent
Preferred crop (optional)
[wheat, maize, soybean, onion] ← Optional suggestion
↓
▶ Plan my season  ⟳ Force live
```

### During Planning (40-50s):
```
Gemini is analysing weather, soil & market data…
Typically 40–50 s · includes live weather, soil properties, 
and mandi prices (market tool via Gemini)
```

### After Plan - Quality Insights (when eval score is low):
```
💡 How to improve your next plan using Arize

📊 Numbers are Grounded — 55%
   "Are estimates backed by live tool data?"
   → Next steps:
   • Click 'Force Live' to fetch fresh weather & market prices...
   • Numbers come from 3 data sources: weather, soil, market tool...

✅ No False Information — 40%
   "Did the AI avoid fiction?"
   → Next steps:
   • Fill in missing budget or farm details...
   • Use Force Live so all numbers come from real tools...

Quick actions for next plan:
✓ Click "Force Live" to fetch fresh data
✓ Complete farm soil type & GPS
```

---

## Summary

| Question | Answer |
|----------|--------|
| What is Market.tool? | Internal Gemini tool that fetches live mandi prices |
| Does it ask for input? | ❌ No — it only provides suggestions |
| What does "Preferred crop" do? | Optional override — helps steer the recommendation |
| What does "Force Live" do? | Fetches fresh weather + soil + market prices (skips cache) |
| Are we suggesting or asking? | ✅ Always suggesting based on data, never asking for input |

---

## How to Test

1. **Fill farm profile** (soil type, GPS)
2. **Leave "Preferred crop" empty** → Agent chooses
3. **Click "Plan my season"** → Gemini uses market tool internally
4. **See low eval score?** → Click "Force Live" → Plan updates with fresh mandi prices
5. **Check ArizeInsights** → Now shows "How to improve" with specific next steps

All references to market tool and preferred crop now clearly explain:
- Market tool = internal data source (mandi prices)
- Preferred crop = optional user preference
- Agent = always provides suggestions, not taking input

