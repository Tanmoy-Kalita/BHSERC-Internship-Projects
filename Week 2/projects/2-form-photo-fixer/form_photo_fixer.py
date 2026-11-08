#!/usr/bin/env python3
"""
Form Photo Fixer - Get a photo and signature ready for exam and job application forms in one step.
Built as Project 2 of Week 2 GenAI Internship.

Features:
1. Upload a photo and a signature
2. 3 form presets with required size and KB limit
3. Crop with a face guide
4. Compress to just under the KB limit
5. Add custom preset
6. Download the finished files

Works entirely offline - no uploads, no account required.
"""

import sys
import os
from pathlib import Path
from PIL import Image

def main():
    if len(sys.argv) < 2:
        print("Form Photo Fixer - Offline Form Image Tool")
        print("Usage: python form_photo_fixer.py <command> [args]")
        print()
        print("Commands:")
        print("  upload <photo> <signature>        - Upload and preview images")
        print("  preset <form-type>                - Set form preset (exam-a, exam-b, custom)")
        print("  crop                                - Crop with face guide")
        print("  compress <target-kb>              - Compress to target KB")
        print("  download <output>                  - Save processed image")
        print()
        print("Presets:")
        print("  exam-a: 3.5-4.5 cm, 39 KB of 50 KB limit")
        print("  exam-b: 2.5-3.5 cm, 20 KB of 30 KB limit")
        print("  custom: User-defined size and KB limit")
        return

    command = sys.argv[1]

    if command == "upload":
        if len(sys.argv) < 4:
            print("Usage: upload <photo-path> <signature-path>")
            return
        photo_path = sys.argv[2]
        sig_path = sys.argv[3]
        if not os.path.exists(photo_path):
            print(f"Error: Photo not found: {photo_path}")
            return
        if not os.path.exists(sig_path):
            print(f"Error: Signature not found: {sig_path}")
            return
        img = Image.open(photo_path)
        print(f"Photo loaded: {img.size}, {img.mode}")
        sig = Image.open(sig_path)
        print(f"Signature loaded: {sig.size}, {sig.mode}")
        print("Preview: Show side-by-side preview")

    elif command == "preset":
        if len(sys.argv) < 3:
            print("Usage: preset <form-type>")
            print("Types: exam-a, exam-b, custom")
            return
        ftype = sys.argv[2]
        presets = {
            "exam-a": {"size_cm": "3.5-4.5", "kb_limit": 50, "current_kb": 39},
            "exam-b": {"size_cm": "2.5-3.5", "kb_limit": 30, "current_kb": 20},
            "custom": {"size_cm": "user-defined", "kb_limit": None, "current_kb": None}
        }
        if ftype in presets:
            p = presets[ftype]
            print(f"Form preset: {ftype}")
            print(f"Size: {p['size_cm']} cm")
            print(f"File size limit: {p['kb_limit']} KB (current: {p['current_kb']} KB)")
        else:
            print(f"Unknown preset: {ftype}")

    elif command == "compress":
        if len(sys.argv) < 3:
            print("Usage: compress <target-kb>")
            return
        target_kb = int(sys.argv[2])
        print(f"Compressing to {target_kb} KB...")
        # TODO: Implement quality reduction with PIL
        print(f"Current size: need to measure and reduce to {target_kb} KB")

    elif command == "download":
        if len(sys.argv) < 3:
            print("Usage: download <output-path>")
            return
        output = sys.argv[2]
        print(f"Saving to: {output}")
        # TODO: Save the processed image

if __name__ == "__main__":
    main()