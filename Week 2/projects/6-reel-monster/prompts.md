Prompts for Reel Monster (Project 6)

=== Prompt 1: Initialize Reel Monster ===
I want to build an Android app that installs on a real phone and shows a cute monster bubble that floats on top of Instagram and YouTube, counting every reel/watched video. Must work offline, no login, no internet. Level 1: manual - tap monster after each reel. Level 2: automatic - monster counts itself. Monster grows and says funny lines as count rises.

Start with a plain Android app that shows a counter, then get it onto your phone. Ask your agent to set up Android tools from command line without Android Studio. Then ask for floating bubble using "display over other apps".

=== Prompt 2: Create Basic Android App with Counter ===
Build a minimal Android app with a floating counter button. The counter should increment when tapped. Get this installed on a real Android phone.

=== Prompt 3: Implement Floating Bubble ===
Add a cute monster bubble that can draw over other apps (System Alert Window permission). The bubble should stay on top of Instagram and YouTube.

=== Prompt 4: Implement Manual Counting (Level 1) ===
Make the monster count manually: user taps the monster after each reel watched. Display the count on the monster.

=== Prompt 5: Implement Automatic Counting (Level 2) ===
Make the monster automatically count each new reel/video itself without user tapping. Use accessibility services or overlay detection.

=== Prompt 6: Implement Monster Growth & Funny Lines ===
As the count rises, the monster grows larger and says different funny lines at milestones (e.g., 10, 20, 50, 100).

=== Prompt 7: Implement Today's Count & Time Lost ===
In the app screen: show today's reel count, time lost (estimated based on count), and last 7 days history.

=== Prompt 8: Test Offline & No Login ===
Verify the app works completely offline - no internet permissions, no login required. Count survives phone restart.

=== Prompt 9: Test Level 2 Within 2 Accuracy ===
For Level 2, verify that over 20 reels, the app's count is within 2 of the user's actual count.

=== Prompt 10: Test Monster Stays On Top ===
Verify the monster bubble stays on top of both Instagram and YouTube without disappearing.