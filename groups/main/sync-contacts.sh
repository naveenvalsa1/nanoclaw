#!/bin/bash

# Contacts Sync Script for Andy
# Syncs contacts from macOS Contacts app to JSON cache
# Run this script on the host Mac via launchd every 30 minutes

set -e

# Output file (will be mounted into container)
OUTPUT_FILE="$HOME/claude-projects/whatsapp-agent/groups/main/contacts-cache.json"

# Temporary file for processing
TEMP_FILE=$(mktemp)

# Function to escape JSON strings
escape_json() {
    echo "$1" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed 's/\n/\\n/g'
}

echo "Syncing contacts from macOS Contacts app..."

# Use AppleScript to export contacts data
osascript <<'EOF' > "$TEMP_FILE"
use framework "Contacts"
use scripting additions

set contactStore to current application's CNContactStore's alloc()'s init()

-- Request access to contacts
set accessGranted to contactStore's requestAccessForEntityType:0 |error|:(missing value)

-- Define keys we want to fetch
set keysToFetch to current application's NSArray's arrayWithObjects:¬
    (current application's CNContactGivenNameKey), ¬
    (current application's CNContactFamilyNameKey), ¬
    (current application's CNContactOrganizationNameKey), ¬
    (current application's CNContactJobTitleKey), ¬
    (current application's CNContactPhoneNumbersKey), ¬
    (current application's CNContactEmailAddressesKey), ¬
    (current application's CNContactNoteKey), ¬
    missing value

-- Fetch all contacts
set fetchRequest to current application's CNContactFetchRequest's alloc()'s initWithKeysToFetch:keysToFetch
set contacts to current application's NSMutableArray's alloc()'s init()

set fetchSuccess to contactStore's enumerateContactsWithFetchRequest:fetchRequest |error|:(missing value) usingBlock:(lambda(contact, stopPointer)
    contacts's addObject:contact
end lambda)

-- Build JSON array
set jsonArray to current application's NSMutableArray's alloc()'s init()

repeat with contact in contacts
    set contactDict to current application's NSMutableDictionary's alloc()'s init()

    -- Name
    set firstName to contact's givenName() as text
    set lastName to contact's familyName() as text
    if firstName is not "" or lastName is not "" then
        set fullName to firstName & " " & lastName
        contactDict's setValue:fullName forKey:"name"
    end if

    -- Organization
    set org to contact's organizationName() as text
    if org is not "" then
        contactDict's setValue:org forKey:"company"
    end if

    -- Job Title
    set jobTitle to contact's jobTitle() as text
    if jobTitle is not "" then
        contactDict's setValue:jobTitle forKey:"title"
    end if

    -- Phone numbers
    set phoneNumbers to contact's phoneNumbers()
    if (count of phoneNumbers) > 0 then
        set phonesArray to current application's NSMutableArray's alloc()'s init()
        repeat with phoneEntry in phoneNumbers
            set phoneValue to (phoneEntry's value()'s stringValue()) as text
            set phoneLabel to (phoneEntry's |label|()) as text
            set phoneDict to current application's NSDictionary's dictionaryWithObjects:{phoneValue, phoneLabel} forKeys:{"number", "type"}
            phonesArray's addObject:phoneDict
        end repeat
        contactDict's setValue:phonesArray forKey:"phones"
    end if

    -- Email addresses
    set emailAddresses to contact's emailAddresses()
    if (count of emailAddresses) > 0 then
        set emailsArray to current application's NSMutableArray's alloc()'s init()
        repeat with emailEntry in emailAddresses
            set emailValue to (emailEntry's value()) as text
            set emailLabel to (emailEntry's |label|()) as text
            set emailDict to current application's NSDictionary's dictionaryWithObjects:{emailValue, emailLabel} forKeys:{"address", "type"}
            emailsArray's addObject:emailDict
        end repeat
        contactDict's setValue:emailsArray forKey:"emails"
    end if

    -- Notes
    set notes to contact's note() as text
    if notes is not "" then
        contactDict's setValue:notes forKey:"notes"
    end if

    jsonArray's addObject:contactDict
end repeat

-- Convert to JSON
set jsonData to current application's NSJSONSerialization's dataWithJSONObject:jsonArray options:1 |error|:(missing value)
set jsonString to current application's NSString's alloc()'s initWithData:jsonData encoding:(current application's NSUTF8StringEncoding)

return jsonString as text
EOF

# Check if AppleScript execution was successful
if [ $? -eq 0 ] && [ -s "$TEMP_FILE" ]; then
    # Create final JSON with metadata
    CONTACT_COUNT=$(cat "$TEMP_FILE" | jq '. | length' 2>/dev/null || echo "0")
    SYNC_TIME=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

    cat > "$OUTPUT_FILE" <<JSON_START
{
  "lastSync": "$SYNC_TIME",
  "contactCount": $CONTACT_COUNT,
  "contacts": $(cat "$TEMP_FILE")
}
JSON_START

    echo "✅ Synced $CONTACT_COUNT contacts at $SYNC_TIME"
    echo "Output: $OUTPUT_FILE"
else
    echo "❌ Failed to sync contacts"
    exit 1
fi

# Cleanup
rm -f "$TEMP_FILE"
