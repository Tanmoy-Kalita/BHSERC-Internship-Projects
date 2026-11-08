Prompts for Form Photo Fixer (Project 2)

=== Prompt 1: Initialize Form Photo Fixer ===
I want to build a tool that takes a photo and signature and prepares them for exam and job application forms. It must have at least 3 form presets with required sizes and KB limits, crop with a face guide, compress to just under the KB limit, add custom presets, and download finished files. Everything works offline - no uploads.

Start with upload, crop and download. Then ask your agent to lower the image quality step by step until the file is just under the limit.

=== Prompt 2: Implement Upload ===
Build the upload feature: accept JPEG/PNG images and a signature image, display them preview-size.

=== Prompt 3: Implement Form Presets ===
Add 3 form presets: Exam form A (3.5-4.5 cm, 39 KB of 50 KB limit), and 2 more with different size/KB requirements. Show size info on screen.

=== Prompt 4: Implement Crop with Face Guide ===
Crop the uploaded photo using a face detection guide. The face should be properly positioned within the form frame.

=== Prompt 5: Implement Compression ===
Compress the image quality step by step until the file is just under the KB limit (e.g., 50 KB). Show before/after file sizes.

=== Prompt 6: Implement Download ===
Save the processed image with the correct dimensions and file size, allow downloading.

... Test with 3 real forms and link their official notices in your report.