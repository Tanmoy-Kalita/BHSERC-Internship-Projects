# Bharat Space Education Research Centre (BSERC)
## GenAI & AI Agents Internship · Week 2: "This week is all about building"
**Instructor:** Karan Bagul  
**Student:** Tanmoy Kalita  

---

## 🎯 Overview & Completion Status
This directory contains all **17/17 projects** across all **4 sections** required by the Week 2 specification. Every single project is fully interactive, features a modern responsive UI, operates completely offline without paid APIs, and is accompanied by a central launchpad dashboard.

| Section | Domain | Total Projects | Status |
|---|---|---|---|
| **Section A** | Web Tools | 5 Projects (01–05) | ✅ 100% Functional & Verified |
| **Section B** | Phone Apps & Games | 3 Projects (06–08) | ✅ PWA & Flight Mode Ready |
| **Section C** | Chrome Extensions | 6 Projects (09–14) | ✅ Manifest V3 + Browser Testbeds |
| **Section D** | Video, Skills & Design | 3 Projects (15–17) | ✅ 100% Built & Audited |
| **Total** | **All Sections** | **17 / 17 Projects** | **✅ Complete** |

---

## 🚀 Interactive Dashboard
To browse, launch, and test all 17 projects from a single visual dashboard:
- Open [`index.html`](index.html) in any web browser.

---

## 📂 Detailed Project Breakdown

### Section A: Web Tools
*Useful software that runs in a browser, with files staying completely on your laptop.*

1. **Project 1: PDF Studio (`projects/1-pdf-studio`)**
   - **Features:** Complete offline PDF manipulation suite featuring 29 tools across 5 groups: Organise (merge, split, reorder, rotate, crop), Edit (redact, add text, shapes, whiteout, sign), Stamp (watermark, page numbers, headers/footers), Convert (images ⇄ PDF, PDF to text), and Finish (compression comparison, metadata).
   - **Offline Architecture:** Bundled local `pdf-lib` and `pdfjs-dist` libraries in `vendor/` to ensure zero CDN dependencies when Wi-Fi is disabled.

2. **Project 2: Form Photo Fixer (`projects/2-form-photo-fixer`)**
   - **Features:** 1-step photo and signature preparer for government exams and job forms.
   - **Capabilities:** Presets for UPSC, SSC, JEE Main, NEET UG, and Indian Passport. Features an interactive face-guide oval crop overlay, canvas compression to just under the exact KB limit, custom preset creation, and dual photo/signature export.

3. **Project 3: Resume Builder (`projects/3-resume-builder`)**
   - **Features:** Live reactive A4 split-screen resume generator.
   - **Capabilities:** 3 distinct templates (Modern, Classic, Creative), native HTML5 drag-and-drop section reordering, JSON data persistence (save/load resume state), and clean 2-page print-to-PDF export with selectable text.

4. **Project 4: CBT Mock Test Engine (`projects/4-cbt-mock-test`)**
   - **Features:** Authentic computer-based exam simulator matching JEE/NEET interfaces.
   - **Capabilities:** Auto-submit countdown timer, color-coded question palette (answered, marked for review, unvisited), +4 right / -1 wrong marking scheme, persistent `localStorage` saving (refresh mid-test loses nothing), and bundled sample exam files (`sample_exam_1_jee.json`, `sample_exam_2_neet.json`).

5. **Project 5: Scribbly Notes (`projects/5-scribbly-notes`)**
   - **Features:** Transforms typed revision notes into natural handwritten notebook pages.
   - **Capabilities:** 3 handwriting styles, 3 ink colors, 3 paper styles (ruled with red margin, grid, plain). Canvas-driven baseline wobble and character jitter prevent machine uniformity; multi-page flow splits text cleanly without cutting lines in half.

---

### Section B: Phone Apps & Games
*Apps and games installable on a real phone with offline flight mode support.*

6. **Project 6: Reel Monster (`projects/6-reel-monster`)**
   - **Features:** Installable PWA (`manifest.json`, `sw.js`) that monitors reel scrolling habits.
   - **Capabilities:** Level 1 (manual tap) and Level 2 (auto-track) modes; evolving monster avatar with humorous commentary as count rises ("Yum! Your evening tastes great", "Burp! Your homework says hi"), today's time lost estimate, and a 7-day historical bar chart.

7. **Project 7: Bill Book (`projects/7-bill-book`)**
   - **Features:** Offline billing app for neighborhood stores with scannable UPI payments.
   - **Capabilities:** Bundled local `qrcode.min.js` (flight mode ready), item catalog with prices, tax and discount math, dynamic UPI deep-link QR codes for the exact bill total, 1-click shareable invoice image generation for WhatsApp, and daily sales ledger.

8. **Project 8: Auto Rally (`projects/8-auto-rally`)**
   - **Features:** High-octane auto-rickshaw racing game built on HTML5 canvas.
   - **Capabilities:** Looping circuit track with camera tracking, dual keyboard (WASD/arrows) and mobile on-screen touch controls, collectible coins, road hazards, nitro power-ups, 3-lap timer with persistent high scores, and Web Audio sound effects with mute toggle.

---

### Section C: Chrome Extensions
*Manifest V3 tools equipped with interactive browser testbed previews.*

9. **Project 9: YouTube Focus Board (`projects/9-youtube-focus-board`)**
   - **Features:** Focus gatekeeper for YouTube study sessions.
   - **Capabilities:** 60-minute "Why are you here?" intention gate, toggles to hide Shorts/comments/recommendations, and timestamped lecture note bookmarks with instant seek.

10. **Project 10: Job Clipper (`projects/10-job-clipper`)**
    - **Features:** 1-click job and internship tracker.
    - **Capabilities:** Scrapes role, company, URL, and deadline; 4-column drag-and-drop Kanban board (Saved, Applied, Interview, Result), approaching deadline indicators, and spreadsheet CSV export.

11. **Project 11: Circle to Fix (`projects/11-circle-to-fix`)**
    - **Features:** Screen annotation bug reporter for AI coding agents.
    - **Capabilities:** Keyboard shortcut (Ctrl+Shift+X), canvas circle/box/arrow drawing tools, deep DOM selector and outerHTML snippet extraction, and 1-click prompt generator.

12. **Project 12: Chat Saver (`projects/12-chat-saver`)**
    - **Features:** Exports ChatGPT and Claude conversations into clean Markdown or PDF.
    - **Capabilities:** Preserves formatting, code blocks, and data tables; selective or full message saving; auto-names file from chat title.

13. **Project 13: Style Spy (`projects/13-style-spy`)**
    - **Features:** 1-click webpage design kit extractor.
    - **Capabilities:** Reads computed styles across all visible DOM elements, displays top colors ranked by usage percentage, catalogs font families/weights/sizes, and exports kits as CSS variables.

14. **Project 14: Tab Goblin (`projects/14-tab-goblin`)**
    - **Features:** Intelligent browser memory management extension.
    - **Capabilities:** Mood-shifting goblin avatar based on open tab count, inactivity age sorter, tab sleep/discard (frees RAM without closing tabs or losing forms), protected Keep list, and session save/restore.

---

### Section D: Video, Skills and Design
*Agent-assisted vertical video editing, custom agent skill authoring, and UI redesign.*

15. **Project 15: One-Minute Reel Cut (`projects/15-one-minute-reel-cut`)**
    - **Features:** Turns 5-minute raw lectures into punchy 60-second vertical 9:16 reels.
    - **Capabilities:** Automated silence and filler word ("umm", "like") cut plan with interactive timeline ("Red stays. Hatched gets cut"), 9:16 portrait face-framing simulation, burned-in subtitles with synchronized keyword highlighting (Hormozi style), title card overlay, audio fades, and downloadable `.webm` reel exporter.

16. **Project 16: Your Own Skill (/viva) (`projects/16-your-own-skill`)**
    - **Features:** Custom agent skill specification adhering to the Antigravity / Claude skill standard (`skills/viva/SKILL.md`).
    - **Capabilities:** Interactive terminal exam runner that conducts 1-by-1 oral examinations from uploaded lecture notes, evaluates nuance, provides follow-up probes, calculates a 5-point score, and points to specific revision pages. Includes 3 test notes (`thermo-notes.txt`, `operating-systems.txt`, `data-structures.txt`) and side-by-side evidence comparing output with vs without the skill.

17. **Project 17: Same Page, New Design (`projects/17-same-page-new-design`)**
    - **Features:** Direct before-and-after design transformation audit.
    - **Capabilities:** [`before.html`](projects/17-same-page-new-design/before.html) (unstyled raw HTML) vs [`after.html`](projects/17-same-page-new-design/after.html) (modern mobile-responsive card layout). Verified **100% exact word match (96/96 words identical)**. Studio includes a 375px phone simulator and documents 3 key design changes (Visual Hierarchy, CTA Affordance, Spatial Chunking).

---

## 🛠️ Verification & Test Suite
All 17 projects have been audited with the automated verification script:
```bash
python projects/audit_all_17.py
```
**Result:** `ALL 17 PROJECTS READY AND VERIFIED!`
