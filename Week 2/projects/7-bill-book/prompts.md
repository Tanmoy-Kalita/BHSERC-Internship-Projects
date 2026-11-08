Prompts for Bill Book (Project 7)

=== Prompt 1: Initialize Bill Book ===
I want to build a billing app for a small shop. Must make a bill, show a UPI QR code, and share on WhatsApp. Must work in flight mode, keep old bills saved, totals match hand calculation on 5 bills. UPI QR code shows exact total. Install on a real phone.

=== Prompt 2: Implement Shop Profile and Item List ===
Build a simple interface where the user can add a shop name (e.g., "Sharma Stores #104"), add items with names and prices (Rice 2 kg @ 120, Oil 1 L @ 165), and calculate total.

=== Prompt 3: Implement Bill Generation ===
When items are added, display a bill screen with itemized list, quantity, discount if any, tax, and final total. Match hand calculation: 120 + 165 = 285.

=== Prompt 4: Implement UPI QR Code ===
Generate a UPI payment link from the shop's UPI ID and the bill total. Convert this link to a QR code that can be scanned by any UPI app to show the correct amount.

=== Prompt 5: Implement Share on WhatsApp ===
Add a "Share on WhatsApp" button that creates an image of the bill and opens WhatsApp share sheet.

=== Prompt 6: Implement Bill History and Daily Total ===
Save each bill locally. Show bill history and calculate daily total. Test: 5 bills with correct totals.

=== Prompt 7: Test Flight Mode ===
Disable Wi-Fi/Cellular. Verify the app still works - no network requests. Old bills still saved.

=== Prompt 8: Test UPI QR Scanning ===
Use a real UPI app to scan the generated QR code. Verify it shows the correct amount.

=== Prompt 9: Test Multiple Bills ===
Create 5+ bills with various items. Verify totals match hand calculation each time.