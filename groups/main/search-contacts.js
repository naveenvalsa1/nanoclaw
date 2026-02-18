#!/usr/bin/env node

/**
 * Contact Search Utility for Andy
 * Searches the contacts cache for people by name, company, phone, or email
 */

const fs = require('fs');
const path = require('path');

const CONTACTS_FILE = path.join(__dirname, 'contacts-cache.json');

function loadContacts() {
  try {
    if (!fs.existsSync(CONTACTS_FILE)) {
      console.error('❌ Contacts cache not found. Run contact sync first.');
      process.exit(1);
    }

    const data = fs.readFileSync(CONTACTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Error loading contacts:', error.message);
    process.exit(1);
  }
}

function searchContacts(query, searchField = 'all') {
  const cache = loadContacts();
  const queryLower = query.toLowerCase();

  const results = cache.contacts.filter(contact => {
    if (searchField === 'all' || searchField === 'name') {
      if (contact.name && contact.name.toLowerCase().includes(queryLower)) {
        return true;
      }
    }

    if (searchField === 'all' || searchField === 'company') {
      if (contact.company && contact.company.toLowerCase().includes(queryLower)) {
        return true;
      }
    }

    if (searchField === 'all' || searchField === 'title') {
      if (contact.title && contact.title.toLowerCase().includes(queryLower)) {
        return true;
      }
    }

    if (searchField === 'all' || searchField === 'phone') {
      if (contact.phones) {
        const phoneMatch = contact.phones.some(p =>
          p.number.replace(/[\s\-\(\)]/g, '').includes(queryLower.replace(/[\s\-\(\)]/g, ''))
        );
        if (phoneMatch) return true;
      }
    }

    if (searchField === 'all' || searchField === 'email') {
      if (contact.emails) {
        const emailMatch = contact.emails.some(e =>
          e.address.toLowerCase().includes(queryLower)
        );
        if (emailMatch) return true;
      }
    }

    if (searchField === 'all' || searchField === 'notes') {
      if (contact.notes && contact.notes.toLowerCase().includes(queryLower)) {
        return true;
      }
    }

    return false;
  });

  return results;
}

function formatContact(contact) {
  let output = `\n📇 ${contact.name || 'Unknown'}`;

  if (contact.title && contact.company) {
    output += `\n   ${contact.title} at ${contact.company}`;
  } else if (contact.company) {
    output += `\n   ${contact.company}`;
  } else if (contact.title) {
    output += `\n   ${contact.title}`;
  }

  if (contact.phones && contact.phones.length > 0) {
    output += `\n   📞 `;
    contact.phones.forEach((phone, i) => {
      if (i > 0) output += `\n      `;
      const type = phone.type ? phone.type.replace('_$!<', '').replace('>!$_', '') : 'phone';
      output += `${phone.number} (${type})`;
    });
  }

  if (contact.emails && contact.emails.length > 0) {
    output += `\n   📧 `;
    contact.emails.forEach((email, i) => {
      if (i > 0) output += `\n      `;
      const type = email.type ? email.type.replace('_$!<', '').replace('>!$_', '') : 'email';
      output += `${email.address} (${type})`;
    });
  }

  if (contact.notes) {
    const shortNotes = contact.notes.length > 100
      ? contact.notes.substring(0, 100) + '...'
      : contact.notes;
    output += `\n   📝 ${shortNotes}`;
  }

  return output;
}

function displayStats() {
  const cache = loadContacts();
  console.log(`\n📊 Contact Statistics`);
  console.log(`   Total contacts: ${cache.contactCount}`);
  console.log(`   Last synced: ${new Date(cache.lastSync).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

  const withPhone = cache.contacts.filter(c => c.phones && c.phones.length > 0).length;
  const withEmail = cache.contacts.filter(c => c.emails && c.emails.length > 0).length;
  const withCompany = cache.contacts.filter(c => c.company).length;

  console.log(`   With phone: ${withPhone}`);
  console.log(`   With email: ${withEmail}`);
  console.log(`   With company: ${withCompany}`);
}

// CLI Interface
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Contact Search Utility

Usage:
  node search-contacts.js <query> [field]
  node search-contacts.js --stats

Examples:
  node search-contacts.js "John"              # Search all fields
  node search-contacts.js "Acme" company      # Search by company
  node search-contacts.js "+91" phone         # Search by phone
  node search-contacts.js "CEO" title         # Search by title
  node search-contacts.js --stats             # Show statistics

Fields: all, name, company, title, phone, email, notes
    `);
    process.exit(0);
  }

  if (args[0] === '--stats') {
    displayStats();
    process.exit(0);
  }

  const query = args[0];
  const field = args[1] || 'all';

  const results = searchContacts(query, field);

  if (results.length === 0) {
    console.log(`\n❌ No contacts found matching "${query}"${field !== 'all' ? ` in field "${field}"` : ''}`);
  } else {
    console.log(`\n✅ Found ${results.length} contact${results.length > 1 ? 's' : ''} matching "${query}":`);
    results.forEach(contact => {
      console.log(formatContact(contact));
    });
  }
}

if (require.main === module) {
  main();
}

module.exports = { loadContacts, searchContacts, formatContact };
