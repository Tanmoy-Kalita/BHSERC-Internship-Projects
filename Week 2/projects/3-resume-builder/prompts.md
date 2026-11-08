Prompts for Resume Builder (Project 3)

=== Prompt 1: Initialize Resume Builder ===
I want to build a tool that fills in a form and watches a clean A4 resume build itself. All data stays on the device - no uploading to any server. It needs 1 form with a live A4 preview, 3 templates that look truly different, drag-and-drop section reordering, export as PDF, and save/load data as a file.

Start with one template and the live preview. Ask your agent to make the page exactly A4, and to export using the browser's Print to PDF so the text stays selectable.

=== Prompt 2: Implement Form with Live A4 Preview ===
Build an HTML form with input fields for name, contact, education, skills, projects. Add a preview area that shows an A4-sized rendering of what the resume will look like. Use CSS to set the preview to A4 dimensions (21cm x 29.7cm) at 72dpi or 96dpi.

=== Prompt 3: Implement 3 Templates ===
Create 3 visually distinct templates using CSS. They should all work with the same form data but look different (different fonts, colors, layouts). Test each one prints to PDF correctly with selectable text.

=== Prompt 4: Implement Drag-and-Drop Section Reordering ===
Allow the user to drag education, experience, skills, and sections into a new order. The preview should update instantly.

=== Prompt 5: Implement Export PDF ===
Use the browser's "Print to PDF" feature (window.print()) to export the preview as a PDF. Ensure the text in the PDF is selectable and copyable (avoid using canvas rendering).

=== Prompt 6: Implement Save/Load Data ===
Add a Save button that downloads a JSON file with all form data. Add a Load button to restore data from a previously saved JSON file.

=== Prompt 7: Test with Long Resume ===
Test that a long resume breaks cleanly across 2 pages in the PDF. Verify text can be selected and copied.

=== Prompt 8: Test Wi-Fi Off ===
Disable Wi-Fi and verify the entire app still works - no network requests should be made.