Multiplayer Related:
- Add avatar crop option to multiplayer
- Character/palette colors for multiplayer
- Members can skip their own turn
- The tag system stays fully functional, but has a new option to hide any dropdown from participants. 
- Ending a session as host currently doesn't update the guests; would like it to say "Thanks for joining! Download transcript: (plaintext) (markdown) (JSON)" to guests once done.
- Once the session chat is done and the host is looking at the chat created, it would be nice if there was an icon next to human user's usernames to show it was a message from a multiplayer session. Honestly the fact that usernames survive once the session is over is great; perhaps we can add a field to the message object for human/LLM sent, and owner/guest to mark human messages sent by others.
- RESUME SESSION / CREATE SESSION FROM EXISTING CHAT (list current characters, guests can pick and those names match up)

Chat homepage:
- Import integration with https://aicharactercards.com/

General/Unsorted:
Ctrl-I and Ctrl-B for automatically adding asterisks or double asterisks around a word. Selecting a word and hitting Ctrl-I will "un-asterisk" the word. Should be able to work like this:
```
*word* <- highlight only "word" literally, still removes asterisks

*word* <- highlight "*word*" literally, still only removes asterisks
```
Same for bold, double-asterisk text.

Just ideas right now:
- PHONE TEXTING UI
- VISUAL NOVEL MODE
- Stat tracking on chats? Used in multiplayer X times, Opened X times, X messages sent, etc...