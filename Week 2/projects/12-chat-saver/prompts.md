Prompts for Chat Saver (Project 12)

=== Prompt 1: Initialize Chat Saver ===
I want to build a Chrome extension that saves any AI chat as a clean PDF or Markdown file in one click. Must work on at least 2 AI chat websites. Can save full chat or selected messages. Keeps headings, lists, tables and code blocks. Exports as Markdown and PDF. Names file from chat's title. Sends nothing to any server.

=== Prompt 2: Identify Chat Website Structures ===
Visit 2 different AI chat websites and inspect their DOM to understand how messages are structured (separation of user vs AI messages, message containers, code blocks, tables).

=== Prompt 3: Implement Message Extraction ===
Build a parser for each website that extracts individual messages, distinguishing between user messages and AI messages. Preserve the order.

=== Prompt 4: Implement Heading and List Preservation ===
Ensure headings (#, ##, ###) and lists (-, *) are preserved in the export format.

=== Prompt 5: Implement Table Preservation ===
Detect HTML tables in the chat and preserve them in Markdown format (with | pipes and headers).

=== Prompt 6: Implement Code Block Preservation ===
Detect code blocks (fenced with ``` or indented) and preserve them exactly in the Markdown export.

=== Prompt 7: Implement Selection Feature ===
Allow user to select specific messages to save (not just the full chat). Only selected messages should be included in the export.

=== Prompt 8: Implement PDF Export ===
Generate a clean PDF from the chat data. The PDF should look similar to the web page layout.

=== Prompt 8: Implement Markdown Export ===
Generate a Markdown file with all preserved elements (headings, lists, tables, code blocks).

=== Prompt 9: Implement File Naming from Title ===
Read the chat's title and use it as the filename for the exported files.

=== Prompt 10: Test on 2 AI Chat Websites ===
Visit 2 different AI chat sites and verify saving works on both.

=== Prompt 11: Test Code and Tables Preservation ===
Verify that code blocks and tables can be copied from the saved file and still work/function correctly.

=== Prompt 12: Test No Server Sending ===
Verify no data is sent to any external server - all processing happens locally.