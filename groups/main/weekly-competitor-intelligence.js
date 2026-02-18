#!/usr/bin/env node

/**
 * Weekly Competitor Intelligence System for Zournal
 * Tracks 11 key competitors across AI-native, traditional+AI, and Big 4 segments
 * Delivers comprehensive email report + WhatsApp summary every Monday at 6 AM IST
 */

const fs = require('fs');
const path = require('path');

// Top 11 Competitors to Monitor
const COMPETITORS = {
  tier1: [
    {
      name: 'Accrual',
      segment: 'AI-Native',
      geography: 'US',
      website: 'https://accrual.ai',
      linkedin: 'https://www.linkedin.com/company/accrualai',
      crunchbase: 'https://www.crunchbase.com/organization/accrual-ai',
      funding: '$75M',
      focus: ['AI-powered accounting', 'Automation', 'Real-time insights']
    },
    {
      name: 'Puzzle',
      segment: 'AI-Native',
      geography: 'US',
      website: 'https://puzzle.io',
      linkedin: 'https://www.linkedin.com/company/puzzlefinancial',
      crunchbase: 'https://www.crunchbase.com/organization/puzzle-financial',
      funding: '$50M',
      focus: ['Real-time accounting', 'AI automation', 'Startup-focused']
    },
    {
      name: 'QuickBooks',
      segment: 'Traditional+AI',
      geography: 'Global',
      website: 'https://quickbooks.intuit.com',
      linkedin: 'https://www.linkedin.com/company/intuit-quickbooks',
      parent: 'Intuit',
      focus: ['AI features rollout', 'Market leader', 'SMB focus']
    },
    {
      name: 'Xero',
      segment: 'Traditional+AI',
      geography: 'Global',
      website: 'https://www.xero.com',
      linkedin: 'https://www.linkedin.com/company/xero',
      focus: ['AI analytics', 'Cloud accounting', 'Global presence']
    },
    {
      name: 'Zoho Books',
      segment: 'Traditional+AI',
      geography: 'India/Global',
      website: 'https://www.zoho.com/books',
      linkedin: 'https://www.linkedin.com/company/zoho-corporation',
      focus: ['GST compliance', 'India market leader', 'AI-powered features']
    }
  ],
  tier2: [
    {
      name: 'Truewind',
      segment: 'AI-Native',
      geography: 'US',
      website: 'https://truewind.ai',
      linkedin: 'https://www.linkedin.com/company/truewind-ai',
      crunchbase: 'https://www.crunchbase.com/organization/truewind',
      funding: '$15M',
      focus: ['AI bookkeeping', 'Startups', 'Automation']
    },
    {
      name: 'Sage Intacct',
      segment: 'Traditional+AI',
      geography: 'Global',
      website: 'https://www.sageintacct.com',
      linkedin: 'https://www.linkedin.com/company/sage-intacct',
      focus: ['Mid-market', 'AI insights', 'Cloud ERP']
    },
    {
      name: 'Ramp',
      segment: 'Traditional+AI',
      geography: 'US',
      website: 'https://ramp.com',
      linkedin: 'https://www.linkedin.com/company/ramp-business',
      crunchbase: 'https://www.crunchbase.com/organization/ramp-4',
      valuation: '$8.1B',
      focus: ['AI spend management', 'Expense automation', 'Finance platform']
    },
    {
      name: 'Deloitte Zora',
      segment: 'Big 4',
      geography: 'Global',
      website: 'https://www2.deloitte.com/global/en/pages/audit/solutions/audit-innovation.html',
      linkedin: 'https://www.linkedin.com/company/deloitte',
      focus: ['AI audit', 'Enterprise', 'Big 4 credibility']
    },
    {
      name: 'PwC GL.ai',
      segment: 'Big 4',
      geography: 'Global',
      website: 'https://www.pwc.com/gx/en/services/audit-assurance/general-ledger.html',
      linkedin: 'https://www.linkedin.com/company/pwc',
      focus: ['General ledger AI', 'Enterprise accounting', 'Automation']
    }
  ],
  tier3: [
    {
      name: 'Digits',
      segment: 'AI-Native',
      geography: 'US',
      website: 'https://digits.com',
      linkedin: 'https://www.linkedin.com/company/digitsfinance',
      crunchbase: 'https://www.crunchbase.com/organization/digits-4',
      funding: '$75M',
      focus: ['AI-native finance', 'Real-time data', 'Benchmark competitor']
    }
  ]
};

// Generate search queries for each competitor
function generateSearchQueries(competitor) {
  const queries = [
    `${competitor.name} funding announcement 2026`,
    `${competitor.name} product launch new features 2026`,
    `${competitor.name} AI capabilities accounting`,
    `${competitor.name} pricing changes`,
    `${competitor.name} partnership announcement`
  ];

  if (competitor.segment === 'AI-Native') {
    queries.push(`${competitor.name} AI model technology`);
  }

  if (competitor.geography.includes('India')) {
    queries.push(`${competitor.name} India market expansion`);
  }

  return queries;
}

// Format email report
function formatEmailReport(updates) {
  const date = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Kolkata'
  });

  let email = `Subject: Zournal Weekly Competitor Intelligence Report - ${date}\n\n`;
  email += `Hi Naveen,\n\n`;
  email += `Here's your weekly competitive intelligence update for Zournal.\n\n`;
  email += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Tier 1 - Critical Threats
  email += `🔴 TIER 1 - CRITICAL THREATS\n\n`;
  const tier1Updates = updates.filter(u => COMPETITORS.tier1.find(c => c.name === u.competitor));
  if (tier1Updates.length > 0) {
    tier1Updates.forEach(update => {
      email += `${update.competitor} (${update.segment} • ${update.geography})\n`;
      email += `${update.summary}\n`;
      if (update.details && update.details.length > 0) {
        update.details.forEach(detail => email += `  • ${detail}\n`);
      }
      if (update.sources && update.sources.length > 0) {
        email += `  Sources: ${update.sources.join(', ')}\n`;
      }
      email += `\n`;
    });
  } else {
    email += `No significant updates this week.\n\n`;
  }

  email += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Tier 2 - High Priority
  email += `🟡 TIER 2 - HIGH PRIORITY\n\n`;
  const tier2Updates = updates.filter(u => COMPETITORS.tier2.find(c => c.name === u.competitor));
  if (tier2Updates.length > 0) {
    tier2Updates.forEach(update => {
      email += `${update.competitor} (${update.segment} • ${update.geography})\n`;
      email += `${update.summary}\n`;
      if (update.details && update.details.length > 0) {
        update.details.forEach(detail => email += `  • ${detail}\n`);
      }
      if (update.sources && update.sources.length > 0) {
        email += `  Sources: ${update.sources.join(', ')}\n`;
      }
      email += `\n`;
    });
  } else {
    email += `No significant updates this week.\n\n`;
  }

  email += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Tier 3 - Benchmark
  email += `🔵 TIER 3 - BENCHMARK (DIGITS)\n\n`;
  const tier3Updates = updates.filter(u => COMPETITORS.tier3.find(c => c.name === u.competitor));
  if (tier3Updates.length > 0) {
    tier3Updates.forEach(update => {
      email += `${update.competitor} (${update.segment} • ${update.geography})\n`;
      email += `${update.summary}\n`;
      if (update.details && update.details.length > 0) {
        update.details.forEach(detail => email += `  • ${detail}\n`);
      }
      if (update.sources && update.sources.length > 0) {
        email += `  Sources: ${update.sources.join(', ')}\n`;
      }
      email += `\n`;
    });
  } else {
    email += `No significant updates this week.\n\n`;
  }

  email += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Strategic Insights
  email += `📊 STRATEGIC INSIGHTS\n\n`;
  email += `Market Trends:\n`;
  email += `• AI-native platforms continue aggressive funding and product expansion\n`;
  email += `• Traditional players accelerating AI integration to compete\n`;
  email += `• Big 4 focusing on enterprise automation and audit capabilities\n`;
  email += `• India market remains underserved by AI-native players\n\n`;

  email += `Zournal Opportunities:\n`;
  email += `• Hybrid human+AI model differentiator\n`;
  email += `• GST complexity expertise advantage in India\n`;
  email += `• Mid-market gap between Big 4 and startups\n`;
  email += `• Partnership opportunities with accounting firms\n\n`;

  email += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  email += `Full competitor profiles and historical tracking available at:\n`;
  email += `/workspace/group/zournal-competitive-intelligence-report.md\n\n`;

  email += `Best,\n`;
  email += `Andy\n`;
  email += `Your Competitive Intelligence Assistant\n`;

  return email;
}

// Format WhatsApp summary
function formatWhatsAppSummary(updates) {
  let summary = `*Weekly Competitor Intel* 📊\n\n`;

  const criticalUpdates = updates.filter(u => COMPETITORS.tier1.find(c => c.name === u.competitor));
  const highPriorityUpdates = updates.filter(u => COMPETITORS.tier2.find(c => c.name === u.competitor));
  const benchmarkUpdates = updates.filter(u => COMPETITORS.tier3.find(c => c.name === u.competitor));

  if (criticalUpdates.length > 0) {
    summary += `*🔴 Critical (${criticalUpdates.length} updates):*\n`;
    criticalUpdates.slice(0, 3).forEach(u => {
      summary += `• *${u.competitor}*: ${u.summary.substring(0, 80)}...\n`;
    });
    summary += `\n`;
  }

  if (highPriorityUpdates.length > 0) {
    summary += `*🟡 High Priority (${highPriorityUpdates.length} updates):*\n`;
    highPriorityUpdates.slice(0, 2).forEach(u => {
      summary += `• *${u.competitor}*: ${u.summary.substring(0, 80)}...\n`;
    });
    summary += `\n`;
  }

  if (benchmarkUpdates.length > 0) {
    summary += `*🔵 Digits:* ${benchmarkUpdates[0].summary.substring(0, 100)}...\n\n`;
  }

  summary += `_Full report sent via email._`;

  return summary;
}

// Main execution
async function main() {
  console.log('Weekly Competitor Intelligence Report Generator');
  console.log('===============================================\n');

  // This script is meant to be called by Claude with web search capabilities
  // It provides the structure and format for the weekly report

  const allCompetitors = [
    ...COMPETITORS.tier1,
    ...COMPETITORS.tier2,
    ...COMPETITORS.tier3
  ];

  console.log('Monitoring these 11 competitors:\n');
  console.log('TIER 1 (Critical):');
  COMPETITORS.tier1.forEach(c => console.log(`  • ${c.name} (${c.segment})`));
  console.log('\nTIER 2 (High Priority):');
  COMPETITORS.tier2.forEach(c => console.log(`  • ${c.name} (${c.segment})`));
  console.log('\nTIER 3 (Benchmark):');
  COMPETITORS.tier3.forEach(c => console.log(`  • ${c.name} (${c.segment})`));

  console.log('\n\nSearch queries to execute for each competitor:');
  allCompetitors.forEach(competitor => {
    console.log(`\n${competitor.name}:`);
    const queries = generateSearchQueries(competitor);
    queries.forEach(q => console.log(`  - ${q}`));
  });

  console.log('\n\nReport structure ready. Claude will execute searches and generate reports.');

  return {
    competitors: allCompetitors,
    formatEmailReport,
    formatWhatsAppSummary
  };
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { COMPETITORS, formatEmailReport, formatWhatsAppSummary, generateSearchQueries };
