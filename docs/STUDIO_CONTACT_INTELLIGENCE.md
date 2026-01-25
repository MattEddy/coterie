# Studio Tier: AI Contact Intelligence

## Overview

Claude-powered contact import that goes beyond fuzzy string matching to understand industry context, infer roles, and suggest relationships.

## Feature Tiers

| Capability | Free | Pro | Studio |
|------------|------|-----|--------|
| Local contacts access | ✓ | ✓ | ✓ |
| Fuzzy name matching | ✓ | ✓ | ✓ |
| Cloud sync (via macOS) | ✓ | ✓ | ✓ |
| AI company matching | | | ✓ |
| AI role classification | | | ✓ |
| Email domain inference | | | ✓ |
| Enrichment suggestions | | | ✓ |
| Deduplication detection | | | ✓ |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ContactPickerView                        │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
│  │ Free Tier   │    │ Pro Tier    │    │ Studio Tier     │ │
│  │ FuzzyMatcher│    │ Cloud Sync  │    │ AI Intelligence │ │
│  └─────────────┘    └─────────────┘    └────────┬────────┘ │
└────────────────────────────────────────────────┬───────────┘
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                ContactIntelligenceService                   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Batch        │  │ Claude API   │  │ Result           │  │
│  │ Processor    │──│ (Haiku)      │──│ Parser           │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  Input: [ContactEntry]                                      │
│  Context: Known companies, relationship types               │
│  Output: [ContactAnalysis]                                  │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. User selects contacts (or selects "Analyze All")

### 2. Batch contacts for API efficiency
```swift
// Group into batches of ~20 contacts per request
// Keeps token count manageable, allows parallel requests
struct ContactBatch {
    let contacts: [ContactEntry]
    let knownCompanies: [String]  // For context
}
```

### 3. Claude analyzes with industry context

**Prompt structure:**
```
You are analyzing contacts for a Hollywood industry CRM.

Known companies in database:
- Warner Bros Discovery (studio)
- Netflix (streamer)
- CAA (agency)
- Bad Robot (production_company)
...

For each contact, determine:
1. Company match (exact match, likely match, or new company)
2. Person type (executive, producer, creative, talent, agent, manager, lawyer)
3. Seniority (entry, mid, senior, c-suite)
4. Confidence (high, medium, low)
5. Notes (any relevant inference)

Contacts to analyze:
1. John Smith, VP Development, Warner Brothers Entertainment, john@wbd.com
2. Jane Doe, Partner, Creative Artists Agency, jdoe@caa.com
3. Bob Wilson, Showrunner, bob@gmail.com
...

Respond in JSON format.
```

### 4. Structured response
```swift
struct ContactAnalysis: Codable {
    let contactId: String

    // Company matching
    let matchedCompany: String?        // Existing company name if matched
    let inferredCompany: String?       // New company name if not matched
    let companyConfidence: Confidence
    let companyReasoning: String?      // "Email domain @wbd.com matches Warner Bros"

    // Person classification
    let personType: String             // executive, producer, etc.
    let seniority: String              // entry, mid, senior, c-suite
    let typeConfidence: Confidence
    let typeReasoning: String?         // "VP title indicates executive role"

    // Enrichment
    let suggestedRelationships: [SuggestedRelationship]?
    let duplicateOf: String?           // Existing person ID if duplicate detected
    let notes: String?

    enum Confidence: String, Codable {
        case high, medium, low
    }
}

struct SuggestedRelationship: Codable {
    let type: String                   // employed_by, represents, etc.
    let targetName: String
    let reasoning: String
}
```

## UI: AI Review Screen

After Claude analysis, show results for user review:

```
┌─────────────────────────────────────────────────────────────┐
│  AI Contact Analysis                         [Import All]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✓ John Smith                                    [Accept]   │
│    VP Development                                [Edit]     │
│    ┌──────────────────────────────────────────────────┐    │
│    │ Company: Warner Bros ← "Warner Brothers Ent."    │    │
│    │ Type: Executive (senior)                         │    │
│    │ Confidence: High (email @wbd.com)               │    │
│    └──────────────────────────────────────────────────┘    │
│                                                             │
│  ⚠ Jane Doe                                      [Accept]   │
│    Partner                                       [Edit]     │
│    ┌──────────────────────────────────────────────────┐    │
│    │ Company: CAA ← "Creative Artists Agency"        │    │
│    │ Type: Agent (senior)                            │    │
│    │ Confidence: High                                │    │
│    │ ⚠ May duplicate: "Jane Doe" already in DB      │    │
│    └──────────────────────────────────────────────────┘    │
│                                                             │
│  ? Bob Wilson                                    [Accept]   │
│    Showrunner                                    [Edit]     │
│    ┌──────────────────────────────────────────────────┐    │
│    │ Company: Unknown (personal email)               │    │
│    │ Type: Creative + Producer                       │    │
│    │ Confidence: Medium                              │    │
│    │ 💡 "Showrunner" = writer-producer hybrid        │    │
│    └──────────────────────────────────────────────────┘    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  3 contacts analyzed • 2 high confidence • 1 needs review  │
│                                    [Cancel]  [Import Selected] │
└─────────────────────────────────────────────────────────────┘
```

## Special Intelligence Features

### Email Domain Mapping
```swift
// Built-in + learned mappings
let domainMap = [
    "wbd.com": "Warner Bros Discovery",
    "nbcuni.com": "NBCUniversal",
    "disney.com": "The Walt Disney Company",
    "netflix.com": "Netflix",
    "caa.com": "CAA",
    "wmeagency.com": "WME",
    // ... etc
]
```

### Title Parsing
```swift
// Claude understands industry-specific titles
"VP Development" → executive, senior
"Creative Executive" → executive, mid
"Partner" (at agency) → agent, senior
"Manager" (at management co) → manager, mid
"Showrunner" → [creative, producer], senior
"EP" → producer, senior
"Line Producer" → producer, mid
"Staff Writer" → creative, entry
"Development Associate" → executive, entry
```

### Company Hierarchy Awareness
```
Warner Bros Discovery
├── Warner Bros Pictures
├── Warner Bros Television
├── HBO / Max
├── New Line Cinema
├── Castle Rock Entertainment
└── DC Studios

The Walt Disney Company
├── Walt Disney Studios
├── Marvel Studios
├── Lucasfilm
├── Pixar
├── 20th Century Studios
├── Searchlight Pictures
└── Disney Television Studios
```

Claude knows these relationships and can match subsidiaries to parents.

### Deduplication Logic
- Same name + same company = likely duplicate
- Similar name + same company = possible duplicate
- Same email = definite duplicate
- Same phone = likely duplicate

## Cost Optimization

### Use Haiku (fast, cheap)
- ~$0.25 per million input tokens
- ~$1.25 per million output tokens
- 20 contacts ≈ 2K tokens in, 1K tokens out ≈ $0.002

### Batch efficiently
- 20 contacts per request = good balance
- 100 contacts = 5 API calls ≈ $0.01

### Cache results
- Store analysis in contact metadata
- Don't re-analyze unchanged contacts

## Implementation Files

```
Services/
├── ContactIntelligenceService.swift   # Main AI service
├── DomainMapper.swift                 # Email domain → company
└── TitleParser.swift                  # Job title → type/seniority

Views/
├── AIContactReviewView.swift          # Review Claude's suggestions
└── ContactPickerView.swift            # Add "Analyze with AI" button

Models/
└── ContactAnalysis.swift              # Response structures
```

## Integration Points

### In ContactPickerView
```swift
// Studio tier users see additional button
if userTier == .studio {
    Button("Analyze with AI") {
        showingAIReview = true
    }
    .buttonStyle(.borderedProminent)
}
```

### Tier Check
```swift
enum UserTier {
    case free      // Local only
    case pro       // Cloud sync
    case studio    // Cloud + AI
}

// Check before AI features
guard SubscriptionService.shared.tier == .studio else {
    showUpgradePrompt()
    return
}
```

## Future Enhancements

1. **LinkedIn enrichment** - Search for contacts, pull recent activity
2. **IMDb/IMDbPro integration** - Match to credits, current projects
3. **News correlation** - "This person was mentioned in today's news"
4. **Relationship suggestions** - "Jane represents 3 people in your network"
5. **Org chart inference** - Build reporting structures from titles
6. **Meeting prep** - "You're meeting with John. Here's context..."
