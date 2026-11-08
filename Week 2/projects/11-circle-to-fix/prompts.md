Prompts for Circle to Fix (Project 11)

=== Prompt 1: Initialize Circle to Fix ===
I want to build a Chrome extension that lets users circle a problem on any web page and get a ready prompt for their coding agent. Features: keyboard shortcut to start drawing mode, draw circle/box/arrow over any page, find the page element under the drawing, take screenshot, note box, one click copies full prompt including element's code and user's note. Sends nothing to any server. Works on 5 different websites.

=== Prompt 2: Implement Keyboard Shortcut for Drawing Mode ===
Add a keyboard shortcut (e.g., Ctrl+Shift+C) that starts drawing mode. When active, the user can draw shapes over the page.

=== Prompt 3: Implement Drawing Shapes (Circle, Box, Arrow) ===
Allow the user to draw a circle, rectangular box, or arrow over any webpage element. The shape should follow the mouse/touch.

=== Prompt 4: Implement Element Detection Under Drawing ===
After the user draws a shape, find the HTML page element under the center of the shape. This is the element the user wants to fix or interact with.

=== Prompt 5: Implement Screenshot ===
Take a screenshot of the page with the drawn shape visible, highlighting the detected element.

=== Prompt 6: Implement Note Box and Prompt Copy ===
Add a text box where the user can add a note. One click copies a full prompt to clipboard that includes: the detected element's HTML/code and the user's note. This prompt can be pasted into a coding agent.

=== Prompt 7: Test on 5 Different Websites ===
Visit 5 different websites and verify the circle-to-prompt workflow works on each.

=== Prompt 8: Test Prompt Includes Element Code ===
Verify the copied prompt includes the HTML element's code (tag name, classes, ID, or selector).

=== Prompt 9: Test No Server Sending ===
Verify that no data is sent to any external server - all processing happens locally in the browser.