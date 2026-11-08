Prompts for CBT Mock Test Engine (Project 4)

=== Prompt 1: Initialize CBT Mock Test Engine ===
I want to build a real computer-based exam screen that can run any question file I give it. It must have a timer with auto-submit, a question palette showing each question's status, mark for review, subject sections with positive/negative marking, and a result page with score, accuracy and time per question. All data stays on device - no uploads.

Start with 5 sample questions in a simple file and one working test screen. Ask your agent to save the answers and time left after every click, so a refresh can restore them.

=== Prompt 2: Create Question File Format ===
Define a simple file format for questions (e.g., JSON or CSV). Each question should have: question text, options (A, B, C, D), correct answer, marks for right/wrong, and optional "mark for review" flag.

=== Prompt 3: Implement Question Loader ===
Read the question file and display the first question with its options. Show question number of total (e.g., Q1 of 5).

=== Prompt 4: Implement Timer with Auto-Submit ===
Build a countdown timer (e.g., 45 minutes for 15 questions). When time runs out, automatically submit the test. Show minutes:seconds format.

=== Prompt 5: Implement Question Palette ===
Show a palette of all question numbers (1-15) with color coding: answered, not answered, marked for review. Clicking a number jumps to that question.

=== Prompt 6: Implement Mark for Review ===
Add a "Mark for review" toggle on each question. Marked questions should appear differently in the palette.

=== Prompt 7: Implement Subject Sections with Marking ===
Support different sections (e.g., Physics, Chemistry) with positive marking (+4 right, -1 wrong) within each section.

=== Prompt 8: Implement Result Page ===
After submission, show a result page with: total score, accuracy percentage, time elapsed, time per question, and breakdown by section.

=== Prompt 9: Test Refresh Persistence ===
Test that refreshing the page mid-test loses nothing - the timer, answers, and marks for review are all restored.

=== Prompt 10: Test with Second Question File ===
Load a second, different question file with no code changes. It should work identically.