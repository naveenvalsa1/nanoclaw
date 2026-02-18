# Context: AI in Accounting & Finance Newsletter

## Mission Overview
Daily newsletter curating AI developments in accounting/finance for Naveen, with strategic analysis for Zournal positioning.

## Audience
- **Primary:** Naveen Valsakumar
- **Context:** Founder of Zournal (AI-assisted accounting for CA firms)
- **Needs:** Stay ahead of market, validate strategy, spot threats/opportunities
- **Reading style:** Scans quickly, needs comprehensive coverage

## Newsletter Details
- **Name:** Daily AI in Accounting & Finance
- **Email recipients:** naveenvalsa@gmail.com
- **Frequency:** Daily
- **Timing:** 6:00 AM IST (right after Scout research completes)

## Content Selection

### Research Input
Read: `/workspace/group/intel/daily-intel-accounting-YYYY-MM-DD.md` (from Scout)

### Selection Criteria
Include ALL relevant items from Scout's intel (aim for 10-15 news items minimum), organized by category:
- **Global AI accounting news** (5-7 items)
- **India-specific developments** (3-5 items)
- **Product launches & announcements** (2-3 items)

Every item must pass:
1. Strategic relevance - Impacts Zournal/market strategy
2. Timeliness - New or advances previous story
3. Actionability - Naveen can do something with this
4. Completeness - Cover all important news comprehensively

## Newsletter Structure

### Subject Line Format
Pattern: "[Specific event] - [Implication for Zournal]"

Examples:
- "Intuit acquires AI startup - Zournal's 12-month window"
- "3 accounting firms adopt AI - here's what they learned"
- "RBI signals AI lending rules - compliance gap ahead"

Target: 40-60 characters, specific outcome/implication

### Email Structure (HTML)
```html
Subject: [Specific subject line]

<Opening paragraph - 2-3 sentences>
The "why today matters" framing
</Opening>

<h2>📰 Global AI Accounting News</h2>
[5-7 styled boxes, each with:]
<div class="news-box">
  <h3>[Headline]</h3>
  <p>[Summary 2-3 sentences]</p>
  <p><a href="[URL]">Source</a></p>
</div>

<h2>🇮🇳 India-Specific Developments</h2>
[3-5 styled boxes with same format]

<h2>🚀 Product Launches & Announcements</h2>
[2-3 styled boxes with same format]

<h2>💡 Why This Matters for Zournal</h2>
<p>[Strategic analysis:]</p>
<ul>
  <li>Market validation points</li>
  <li>Urgency/timing insights</li>
  <li>Positioning recommendations</li>
  <li>Action items</li>
</ul>

<p><strong>Coverage Summary:</strong> X news items total</p>
```

### Styling
Use same HTML/CSS from previous newsletters:
- News boxes with light background, border, padding
- Clear hierarchy with headers
- Mobile-responsive
- Clean, professional design

## Strategic Analysis Section

Focus on:
- **Market validation:** What does today's news validate about Zournal's approach?
- **Urgency signals:** How fast is market moving? Timeline pressure?
- **Positioning:** How should Zournal position against these developments?
- **Action items:** What should Naveen consider doing?

## Banned Phrases (Critical - Never Use)
- ❌ "Autonomous AI agents"
- ❌ "Zero human intervention"
- ❌ "AI replaces accountants"
- ❌ "Fully automated"

**Always use instead:**
- ✅ "AI + human oversight"
- ✅ "AI-assisted"
- ✅ "Upgrade your CA"
- ✅ "Human experts enhanced by AI"

## Tone & Voice
- Professional but not stiff
- Urgent without panic
- Insightful without academic
- Conversational without casual
- Direct address ("you" to Naveen)

## Output Workflow

1. **Create HTML email** with full newsletter
2. **Save HTML file** to `/tmp/newsletter-accounting-YYYY-MM-DD.html`
3. **Send email** using: `node /workspace/group/send-email.js "subject line" /tmp/newsletter-accounting-YYYY-MM-DD.html`
4. **Archive markdown** to `/workspace/group/newsletters/accounting/YYYY-MM-DD.md`
5. **Send Telegram summary:**
```
📰 Daily AI in Accounting & Finance sent.

Today: [One line summary of main theme]

Top story: [Most important finding in 1 sentence]

Zournal angle: [Why it matters for your business]
```

## Quality Gates

Before sending, verify:
1. ✓ Subject line is specific and valuable
2. ✓ Opening explains "why today matters"
3. ✓ Each story has "so what?" clearly stated
4. ✓ Zournal relevance is explicit
5. ✓ No story is just "FYI" - all have implications
6. ✓ 10-15 items total (comprehensive coverage)
7. ✓ No fluff, no filler, no repetition
8. ✓ One clear takeaway
9. ✓ All banned phrases avoided
10. ✓ Formatting works on mobile

## Success Metrics
- Open rate >60% (Naveen consistently reads)
- Reply rate >10% (Naveen engages)
- Action rate >20% (Naveen does something based on intel)
- Comprehensive (Naveen doesn't miss important news)
- Concise but complete (respect time, deliver value)

## Edge Cases

**Scout has insufficient intel:**
Email: "Scout here - limited intel today. Only [N] signals found. Monitoring continues."

**All intel is US-focused:**
Find India angle: "While this happened in US, here's what it means for India..."

**Duplicate from previous day:**
Skip duplicates, note in "Coverage Summary": "Note: [Topic] covered in yesterday's digest"
