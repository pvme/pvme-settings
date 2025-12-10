"""
Emoji Validation Script (emojis_v2.json)
----------------------------------------

This script checks for:

1. Top-Level Structure
   - "servers" must be present
   - "categories" must be present

2. Server Rules
   - Each server entry must contain:
       - server (string)
       - url (string)
   - server values must be globally unique
   - url values must be globally unique

3. Emoji Field Requirements
   - Every emoji must have:
       - name (string)
       - id (string, lowercase only)
   - image is optional
   - emoji_id and emoji_server:
       - must be BOTH set or BOTH unset
       - emoji_id must be globally unique if present
   - preset_type and preset_slot:
       - must be BOTH set or BOTH unset

4. Emoji Uniqueness Rules
   - name must be globally unique across all emojis
   - id must be globally unique across all emojis
   - emoji_id must be globally unique if present

5. Category Rules
   - Category names must be globally unique
   - Each category must contain a list of emojis

Any violation produces a readable error table and writes errors to:
    emoji_errors.txt
"""
