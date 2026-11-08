Prompts for YouTube Focus Board (Project 9)

=== Prompt 1: Initialize YouTube Focus Board ===
I want to build a Chrome extension that removes YouTube distractions. Must hide Shorts, recommendations and comments. Users add videos to a study list, click a note to jump to timestamp, see time spent today, and hit a "Why are you here?" gate that unlocks YouTube for 60 minutes. All data survives Chrome restart, works without reload between videos.

=== Prompt 2: Implement Hide Shorts/Recommendations/Comments ===
Build the core content hiding. YouTube changes videos without reloading, so the extension must re-apply hiding whenever new content loads. Use MutationObserver or similar.

=== Prompt 3: Implement Study List ===
Add a study list where users can add videos with names and timestamps. Clicking a note in the list should jump to that timestamp in the video.

=== Prompt 4: Implement Time Spent Today ===
Track and display how much time the user has spent on YouTube today.

=== Prompt 5: Implement "Why are you here?" Gate ===
Add a prompt/page that asks "Why are you here?" when the user opens YouTube. After they type their reason, unlock YouTube for 60 minutes, then re-apply the distraction-hiding.

=== Prompt 6: Implement Notes Linked to Timestamps ===
Allow users to add notes with timestamps. Clicking a note jumps to that moment in the video.

=== Prompt 7: Test Data Survives Chrome Restart ===
Close and reopen Chrome. Verify study list, notes, and time data are still there.

=== Prompt 8: Test Without Reload ===
Navigate between videos without the page fully reloading. Verify hiding is re-applied.