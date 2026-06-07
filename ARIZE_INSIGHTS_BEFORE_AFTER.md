# Arize Insights - Before & After Comparison

## BEFORE (Old Implementation)

```
┌─────────────────────────────────────────────┐
│ Quality Check                               │
│                                             │
│ Plan Relevance                         72%  │
│ ████████████░░░░░░░░░░░░░░░ (emerald)      │
│                                             │
│ Data Grounding                         55%  │
│ ███████░░░░░░░░░░░░░░░░░░░░░░░░ (amber)    │
│                                             │
│ Crop Choice                            68%  │
│ ██████████░░░░░░░░░░░░░░░░░░░░░ (amber)    │
│                                             │
│ Information Accuracy                   40%  │
│ ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ (red)    │
│                                             │
│ To improve scores:                          │
│ • Complete farm profile with accurate       │
│   soil type and location                    │
│ • Use Force Live to fetch fresh data        │
│ • Specify preferred crop if you have        │
│   one in mind                               │
└─────────────────────────────────────────────┘
```

**Problems:**
- ❌ Generic "To improve scores" section
- ❌ Same 3 suggestions for ALL low scores
- ❌ No context about what each dimension means
- ❌ No Action oriented copy
- ❌ Judges don't know how to improve

---

## AFTER (New Implementation)

```
┌─────────────────────────────────────────────────────────────────┐
│ 💡 How to improve your next plan                                │
│    Using Arize as your quality guide                            │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 📊 Numbers are Grounded                                    55%  │
│    "Are estimates backed by live tool data?"                    │
│    ███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ (amber)          │
│                                                                 │
│    → Next steps:                                                │
│    • Click 'Force Live' to fetch fresh weather & market prices  │
│      (the market tool internally calls Gemini to get live       │
│       mandi rates)                                              │
│    • Numbers in your plan come from 3 data sources: weather     │
│      tool, soil tool, and market tool (all via Gemini)          │
│    • Ensure your farm GPS coordinates are accurate              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ✅ No False Information                                    40%  │
│    "Did the AI avoid fiction?"                                  │
│    ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ (red)              │
│                                                                 │
│    → Next steps:                                                │
│    • Fill in missing budget or farm details to reduce           │
│      AI guessing                                                │
│    • Use Force Live so all numbers come from real tools         │
│      (weather, soil, mandi prices), not training data           │
│    • Provide exact soil type & location for higher confidence   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Quick actions for next plan:                                    │
│                                                                 │
│ ✓ Click "Force Live" to fetch fresh data                        │
│ ✓ Complete farm soil type & GPS                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Improvements:**
- ✅ Clear header: "How to improve your next plan using Arize"
- ✅ Each dimension has its own tailored action items
- ✅ Icons + contextual hints make it clear what's being measured
- ✅ Specific, actionable next steps
- ✅ Market tool clarified ("market tool internally calls Gemini")
- ✅ Quick action buttons at the bottom

---

## The Key Difference

### Old Logic:
```
If score < 0.70 {
  Show generic tips (same for all)
}
```

### New Logic:
```
For each dimension (groundedness, relevance, etc.) {
  If score < 0.70 {
    Show dimension-specific tips + context
    Show hints about what this dimension means
    Show dedicated next steps
  }
}
```

---

## Examples of Dimension-Specific Guidance

### 📊 Numbers are Grounded (when low)
**What it means:** Income/yield estimates aren't backed by real tool data
**Specific actions:**
- Force Live to fetch fresh market prices
- Check that weather, soil, and market data are current
- Verify GPS accuracy

### 🎯 Plan Relevance (when low)
**What it means:** Plan isn't specific to this farm
**Specific actions:**
- Fill in soil type
- Check GPS coordinates
- Try different seasons

### 🌾 Crop Accuracy (when low)
**What it means:** Recommended crop might not be right
**Specific actions:**
- Double-check soil type (clay, loam, etc.)
- Consider preferred crop override
- Check rainfall forecast

### ✅ No False Information (when low)
**What it means:** AI might have guessed
**Specific actions:**
- Complete farm details (reduce guessing)
- Use Force Live (all data from tools)
- Add exact soil type & location

---

## Code Structure

### New Helper Functions:
```
getIcon(key)          → Returns emoji for each dimension
getHint(key)          → Returns contextual question
getActionItems(key)   → Returns 3 tailored next steps
```

### Usage:
```tsx
const dims = [
  {
    key: 'groundedness',
    score: 0.55,
    label: 'Numbers are Grounded',
    icon: '📊',
    hint: 'Are estimates backed by live tool data?',
    actionItems: [
      'Click "Force Live" to fetch fresh...',
      'Numbers come from 3 sources...',
      'Ensure GPS coordinates are...'
    ]
  },
  // repeat for each dimension
]
```

---

## Market Tool Clarification (Now in UI)

### Before:
> "market tool needs real-time commodity price data — cached prices may be stale"

### After:
> "market tool internally calls Gemini to get live mandi rates"
> "Numbers in your plan come from 3 data sources: weather tool, soil tool, and market tool (all via Gemini)"

**What changed:**
- Users now know market tool is INTERNAL (not asking for input)
- Clear that it's one of 3 data sources
- Clarifies it fetches mandi prices via Gemini
- Removes confusion between "preferred crop preference" and "market data"

---

## Result

**Judges/Users now understand:**
1. ✅ Market tool = internal data fetch (mandi prices)
2. ✅ Preferred crop = optional override (not input to tool)
3. ✅ Force Live = refresh all 3 tools
4. ✅ Each low score has specific fixes
5. ✅ Agent is always suggesting, never asking

