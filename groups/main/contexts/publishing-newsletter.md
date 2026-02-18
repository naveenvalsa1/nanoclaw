# Context: AI in Publishing & Self-Publishing Newsletter

## Mission Overview
Daily newsletter curating AI developments in publishing/self-publishing for Naveen, with strategic analysis for Notion Press positioning.

## Audience
- **Primary:** Naveen Valsakumar
- **Context:** Founder of Notion Press (India's largest self-publishing platform)
- **Needs:** Stay ahead of market, understand author expectations, spot threats/opportunities
- **Reading style:** Scans quickly, needs comprehensive coverage

## Newsletter Details
- **Name:** Daily AI in Publishing & Self-Publishing
- **Email recipients:** naveenvalsa@gmail.com
- **Frequency:** Daily
- **Timing:** 6:10 AM IST (right after Scout research completes)

## Content Selection

### Research Input
Read: `/workspace/group/intel/daily-intel-publishing-YYYY-MM-DD.md` (from Scout)

### Selection Criteria
Include ALL relevant items from Scout's intel (aim for 10-15 news items minimum), organized by category:
- **Global publishing AI news** (5-7 items)
- **India-specific developments** (3-5 items)
- **Author tools & platforms** (2-3 items)

Every item must pass:
1. Strategic relevance - Impacts Notion Press/author expectations
2. Timeliness - New or advances previous story
3. Actionability - Naveen can do something with this
4. Completeness - Cover all important news comprehensively

## Newsletter Structure

### Subject Line Format
Pattern: "[Specific event] - [Implication for Notion Press]"

Examples:
- "AI writing tools hit 1M authors - quality bar shifting"
- "Amazon updates KDP AI disclosure rules - compliance needed"
- "Indian author survey: 60% now use AI tools"

Target: 40-60 characters, specific outcome/implication

### Email Structure (HTML)
```html
Subject: [Specific subject line]

<Opening paragraph - 2-3 sentences>
The "why today matters" framing
</Opening>

<h2>📚 Global Publishing AI News</h2>
[5-7 styled boxes, each with:]
<div class="news-box">
  <h3>[Headline]</h3>
  <p>[Summary 2-3 sentences]</p>
  <p><a href="[URL]">Source</a></p>
</div>

<h2>🇮🇳 India-Specific Developments</h2>
[3-5 styled boxes with same format]

<h2>✍️ Author Tools & Platforms</h2>
[2-3 styled boxes with same format]

<h2>💡 Why This Matters for Notion Press</h2>
<p>[Strategic analysis:]</p>
<ul>
  <li>Author expectation shifts</li>
  <li>Competitive positioning</li>
  <li>Service gap opportunities</li>
  <li>Action items</li>
</ul>

<p><strong>Coverage Summary:</strong> X news items total</p>
```

### Styling
Use same HTML/CSS as accounting newsletter:
- News boxes with light background, border, padding
- Clear hierarchy with headers
- Mobile-responsive
- Clean, professional design

## Strategic Analysis Section

Focus on:
- **Author expectations:** How are AI tools changing what authors expect from publishers?
- **Quality impact:** Is AI raising or lowering published book quality?
- **Service positioning:** What should Notion Press add/improve/automate?
- **Competitive threats:** Who's building AI-first publishing platforms?
- **Pricing pressure:** Do AI tools commoditize editing/design services?

## Tone & Voice
- Professional but accessible
- Author-centric (how does this affect authors?)
- Opportunistic (focus on opportunities, not just threats)
- Practical (actionable insights)
- Direct address ("you" to Naveen)

## Output Workflow

1. **Create HTML email** with full newsletter
2. **Save HTML file** to `/tmp/newsletter-publishing-YYYY-MM-DD.html`
3. **Send email** using: `node /workspace/group/send-email.js "subject line" /tmp/newsletter-publishing-YYYY-MM-DD.html`
4. **Archive markdown** to `/workspace/group/newsletters/publishing/YYYY-MM-DD.md`
5. **Send Telegram summary:**
```
📚 Daily AI in Publishing sent.

Today: [One line summary of main theme]

Top story: [Most important finding in 1 sentence]

Notion Press angle: [Why it matters for your business]
```

## Quality Gates

Before sending, verify:
1. ✓ Subject line is specific and valuable
2. ✓ Opening explains "why today matters"
3. ✓ Each story has "so what?" clearly stated
4. ✓ Notion Press relevance is explicit
5. ✓ No story is just "FYI" - all have implications
6. ✓ 10-15 items total (comprehensive coverage)
7. ✓ No fluff, no filler, no repetition
8. ✓ One clear takeaway
9. ✓ Formatting works on mobile
10. ✓ Author perspective maintained

## Success Metrics
- Open rate >60% (Naveen consistently reads)
- Reply rate >10% (Naveen engages)
- Action rate >20% (Naveen does something based on intel)
- Comprehensive (Naveen doesn't miss important news)
- Author-relevant (every item connects to author experience)

## Edge Cases

**Scout has insufficient intel:**
Email: "Scout here - limited publishing intel today. Only [N] signals found. Monitoring continues."

**All intel is US/EU-focused:**
Find India angle: "While this is US/EU news, here's the India impact for authors..."

**Duplicate from previous day:**
Skip duplicates, note in "Coverage Summary": "Note: [Topic] covered in yesterday's digest"

**AI controversy/ethics news:**
Include but frame constructively: Focus on how Notion Press can guide authors responsibly
