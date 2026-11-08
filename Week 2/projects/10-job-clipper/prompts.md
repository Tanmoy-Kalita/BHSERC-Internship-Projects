Prompts for Job Clipper (Project 10)

=== Prompt 1: Initialize Job Clipper ===
I want to build a Chrome extension that saves job applications. On any job page, one click saves role, company, link and deadline. Every application sits on one board with columns: Saved, Applied, Interview, Result. Drag cards across columns. Editable fields, deadline reminder, search plus CSV export. Works on 3 different job sites. When details can't be detected, user can type them by hand.

=== Prompt 2: Implement One-Click Save ===
Detect job page information (role, company, link, deadline) and save with one click. Use DOM inspection to find these elements.

=== Prompt 3: Implement Board with Drag-and-Drop ===
Create a Kanban-style board with four columns: Saved, Applied, Interview, Result. Users can drag cards across columns to track application progress.

=== Prompt 4: Implement Editable Fields ===
If the extension can't detect some field (e. the job site structure is different), allow the user to type in that field manually. All fields should be editable.

=== Prompt 5: Implement Deadline Reminder ===
Add a date/time for each application. Set up a notification (using Chrome notifications API) that reminds the user before the deadline.

=== Prompt 6: Implement Search and CSV Export ===
Add a search box to filter applications. Add a "Export as CSV" button that generates a CSV file with all application data.

=== Prompt 7: Test on 3 Different Job Sites ===
Visit 3 different job sites and verify the extension can save at least basic info from each.

=== Prompt 8: Test Manual Typing ===
When auto-detection fails, verify the user can type in the role, company, link, and deadline manually.

=== Prompt 9: Test CSV Export ===
Export saved applications to CSV and open in a spreadsheet program (Excel, Google Sheets). Verify columns are correct.