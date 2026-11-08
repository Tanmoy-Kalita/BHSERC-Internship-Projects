Prompts for Tab Goblin (Project 14)

=== Prompt 1: Initialize Tab Goblin ===
I want to build a Chrome extension that clears tab clutter. Shows tab count and a goblin whose mood changes with it. Lists tabs by how long they've been ignored. Puts tabs to sleep without closing them. Has a "Keep" list the goblin never touches. Saves a session and restores it. Handles 30 open tabs smoothly, never loses a half-filled form, survives Chrome restart, sleeping tabs wake correctly when clicked.

=== Prompt 2: Implement Tab Count and Goblin Mood ===
Display the total number of open tabs and change the goblin's expression/color based on count (happy for many tabs, sad/full for few).

=== Prompt 3: Implement Tab Listing by Last Use ===
List all open tabs ordered by last activity/time since last accessed. Show tab title and favicon.

=== Prompt 4: Implement Tab Sleep (Discard) ===
Use Chrome's built-in tab discard feature to put tabs to sleep (free memory without closing). The tab should gray out or show a "sleeping" indicator.

=== Prompt 5: Implement Keep List ===
Allow user to right-click a tab and add it to a "Keep" list. Keeped tabs should never be slept/discarded, even when the goblin "feeds" on other tabs.

=== Prompt 6: Implement Session Save/Restore ===
Save the current tab state (which tabs are open, which are kept, which are slept) and restore it on Chrome restart.

=== Prompt 7: Test 30 Tabs Smoothly ===
Open 30 tabs and verify the extension handles them smoothly without crashing.

=== Prompt 8: Test Form Preservation ===
Have a half-filled form in one tab. Feed the goblin. Verify the form data is never lost.

=== Prompt 9: Test Chrome Restart Survival ===
Close and reopen Chrome. Verify saved session is restored correctly.

=== Prompt 10: Test Sleeping Tabs Wake ===
Click on a sleeping tab and verify it wakes up and becomes active correctly.