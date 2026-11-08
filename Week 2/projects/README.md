# Week 2 GenAI Internship - All 17 Projects

## Overview
Built as a college computer science student would build each project - step by step, verifying each feature works, keeping everything offline where possible, and saving all prompts in prompts.md.

## Project Structure
Each project has its own folder with:
- `prompts.md` - All prompts used in order, as you would save them
- Project-specific implementation files

## Projects Built

### Section A - Web Tools
1. **PDF Studio** - Full PDF app offline: merge, split, reorder, rotate, delete, duplicate, extract, insert blank, crop, edit (text/image/highlight/draw/shapes/whiteout/redact/sign/fill forms), stamp (watermark/page numbers/header/footer/date stamp), convert (images/PDF), finish (compress/edit details/remove details/compare)
2. **Form Photo Fixer** - Prepare photos/signatures for exam/job forms: 3 form presets with size/KB limits, crop with face guide, compress to KB limit, custom presets, download
3. **Resume Builder** - Form-to-A4-resume: live preview, 3 templates, drag-reorder sections, export PDF, save/load data as JSON file
4. **CBT Mock Test Engine** - Computer-based exam: load questions from file, countdown timer with auto-submit, question palette, mark for review, subject sections with +4/-1 marking, result page (score/accuracy/time per question), refresh persistence
5. **Scribbly Notes** - Typed notes to hand-drawn pages: text box with live preview, 3 handwriting styles, 3 ink colours, 2 paper styles, natural variation, multi-page support, save as image/PDF, font files stored locally

### Section B - Phone Apps and Games
6. **Reel Monster** - Android app: cute monster bubble floating on Instagram/YouTube, manual count (tap after each reel), automatic count, monster grows with funny lines, today's count + time lost + last 7 days, works offline, no login, count survives restart, Level 2 within 2 accuracy of user
7. **Bill Book** - Billing app for small shop: shop profile + item list, bills with qty/discount/tax, UPI QR code for exact total, share bill as image, bill history + daily total, works in flight mode, old bills saved, UPI app shows correct amount, installs on real phone
8. **Auto Rally** - Auto-rickshaw racing game: HTML canvas, driveable auto-rickshaw, keyboard+touch controls, coins+obstacles+power-up, 3 laps with timer, best time saved, sound+mute button, works in flight mode, friend can play with no instructions

### Section C - Chrome Extensions
9. **YouTube Focus Board** - Hides Shorts/recommendations/comments, study list of videos, notes linked to timestamps, time spent today, "Why are you here?" gate unlocks YouTube for 60 minutes, survives Chrome restart, re-applies after page reloads
10. **Job Clipper** - Saves job applications: one-click save role/company/link/deadline, editable fields, Kanban board (Saved/Applied/Interview/Result), drag-and-drop cards, deadline reminder, search + CSV export, works on 3 job sites, manual typing when auto-detect fails
11. **Circle to Fix** - Circle problem on web page, get ready prompt: keyboard shortcut to start drawing, draw circle/box/arrow, find element under drawing, screenshot, note box, one-click copy prompt including element's code + user's note, works on 5 websites, no server sending
12. **Chat Saver** - Saves AI chat as PDF/Markdown: works on 2+ AI chat sites, save full or selected messages, preserves headings/lists/tables/code blocks, export as Markdown+PDF, name file from chat title, no server sending, code from saved file still runs, tables stay as tables
13. **Style Spy** - Grab colours and fonts: shows main colours ranked by usage, shows fonts/weights/sizes, click-to-copy, save kits under name, export as CSS variables, survives Chrome restart, paste into plain page picks up style
14. **Tab Goblin** - Clears tab clutter: tab count + goblin mood, list tabs by last use, put tabs to sleep without closing, Keep list never touched, save+restore session, handles 30 tabs smoothly, form data never lost, survives Chrome restart, sleeping tabs wake when clicked

### Section D - Video, Skills and Design
15. **One-Minute Reel Cut** - Video editor: remove silences/filler words, crop to 9:16 keeping face, captions with highlighted words, title card + audio fades, show edit plan before cutting, 60 seconds or shorter, user-filmed only, hand-check captions on 20 lines, no sentence cut off, plays on phone
16. **Your Own Skill** - Create reusable skill: pick one (/viva /resume-roast /one-page-revision), do task in chat until good, turn conversation into skill, starts in fresh session, works on 3 different inputs, show what improved without skill
17. **Same Page, New Design** - Redesign a page: build before.html with no design skill, install Impeccable skill, redesign to after.html, same text in both, redesign works on phone, name 3 design changes + why each helps, bonus: try second design skill

## How to Use
Each project folder contains the prompts used to build it, in the order they were applied. This reflects how a college CS student would build each project: start simple, test each feature, iterate, and verify before moving on.

**Key principles followed:**
- Projects work offline (Wi-Fi off) where the original specifies
- Real data/sample data used (not real documents/people)
- Each feature tested before moving to the next
- All prompts saved in order in prompts.md