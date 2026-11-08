Prompts for Style Spy (Project 13)

=== Prompt 1: Initialize Style Spy ===
I want to build a Chrome extension that grabs colors and fonts from any website and saves them as a kit. Show main colors ranked by usage, show fonts with weights and sizes, click to copy, save kits under a name, export kit as CSS variables. Works on 5 websites, survives Chrome restart, pasting a kit into a plain page picks up the style.

=== Prompt 2: Implement Color Extraction ===
Read the computed style of visible elements on the page. Count how much of the page uses each color (by area or element count). Rank colors by usage and display top colors.

=== Prompt 3: Implement Font Extraction ===
Read each element's computed font-family, font-weight, and font-size. Display the fonts, weights, and sizes used on the page.

=== Prompt 4: Implement Click-to-Copy ===
Allow user to click on any color or font in the kit panel to copy it to clipboard.

=== Prompt 5: Implement Save Kits ===
Allow user to save a kit under a custom name. Kits should survive a Chrome restart.

=== Prompt 6: Implement Export as CSS Variables ===
Generate CSS variable code (e.g., --primary-color: #ff0000; --heading-font: Arial;) that can be pasted into any project.

=== Prompt 7: Test on 5 Websites ===
Visit 5 different websites and verify the color/font extraction works on each.

=== Prompt 8: Test Survival of Chrome Restart ===
Close and reopen Chrome. Verify saved kits are still accessible.

=== Prompt 9: Test Paste into Plain Page ===
Paste the exported CSS kit into a plain HTML page and verify the styles are applied correctly.