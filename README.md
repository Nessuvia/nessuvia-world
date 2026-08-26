Xenia (ξενία, zenee-a) - the ancient Greek concept of hospitality; "guest-friendship," rooted in generosity and reciprocity. 
[Encyclopedia Britannica](https://www.britannica.com/topic/xenia-sociology)

Alternate Names: Xenia, X.N, Xen (/zɛn/, zen)

# Xenia Nessuvia

Xenia Nessuvia is character chat app inspired by SillyTavern. It runs entirely in the browser. Chats, characters, and settings live in IndexedDB. Model requests go from your browser to an OpenAI-compatible endpoint using the key you provide.

There's no backend and no accounts by design. You could download the source code and run it fully locally if you wish.

On [xenia.nessuvia.com](https://xenia.nessuvia.com/), the site can install as a PWA and run in fullscreen.

## Why?
I made this for myself after a long time of using SillyTavern. I'll say straight up I have nothing but appreciation for everyone who's contributed to the codebase in any way. It's an amazing application. With that said, I made Xenia Nessuvia because I wanted a statically served frontend I could access from any device with internet access, and I wanted my saves to be easily portable. The portability is the main reason behind most of the weird limitations, like how the Character Gallery only accepts links and not uploading your own pictures. Keeping links is just way, way smaller in size (I'm not against some image uploads, like Persona or Character avatars).

**Multiplayer**

This is the one I haven't seen anywhere else, at least not built-in* in any frontend I've used. The host starts a session and shares a link; guests open it, make a persona, and join the same chat without installing anything or making an account. Everyone sees the same messages as they stream in. There's a turn order you can rearrange, and a Narrator role that fills the DM seat when nobody's character should be the one to answer. Only the host has an API key, and only the host talks to the model. The relay carries messages and presence between browsers and nothing else, so keys never leave the host's tab and nothing is stored on the way through. If you'd rather not use my relay, you can run your own; see [Where data goes](#where-data-goes).

*[STMP](https://github.com/RossAscends/STMP) exists as an extension, though the only time I used it was on the initial release version. It still lit a spark in me that echoed all the way down to this feature.

**Mobile**

Mobile support was something that started small, but I fully intend to make it a first-class feature. Xenia Nessuvia is supported as a PWA, so you can add it to the home screen of your mobile devices and use it in full screen, inspired by ST-android.

**Palette**

The Palette feature was born from the fun I had making custom CSS in SillyTavern, extended into a technical menu with built-in font loading, app-wide text colors, panel style, etc. The custom HTML and CSS backgrounds were directly inspired by SillyTavern's custom CSS loading. As a web dev, I knew it could have more potential if we allowed some scoped CSS and the ability to place HTML elements, so that's where that came from.

**Chat**

The Chat is the most "standard" feature I have. It's got support for everything in the TavernV2 specification, as well as some quality-of-life features I love, like Alternate Descriptions, a Gallery, per-character text coloring, etc. The lorebooks are very barebones; sorry, I don't use character lorebooks much at all, so it hasn't gotten much love. (Though with a nice UI, I may be tempted to try them out more!)

**Write**

Write is the long-form half of the app, and it's the feature I've torn down and rebuilt the most. Exports come out as HTML, plain text, or JSON.

The part I actually care about is the Plot Layout. A Chapter is a row of beats, each with a word target, so the model gets a plan instead of a shrug and the word "continue." A Premise sits before the first Chapter and an Ending after the last one, so it knows where this started and where it's supposed to land. Every Chapter also has a summary and a switch for what it hands over — summary and beats, beats only, summary only, or nothing at all — which is how old Chapters shrink down to a recap while the one you're in stays whole. There's a Direction box too, for the standing note that isn't a beat and isn't a prompt, the "stop having them sigh" kind of thing.

**Prompts**

The prompt handling is another feature inspired by SillyTavern. I wanted prompt "blocks" that were reusable, easily rearranged, and supported XML-style tagging (which I use heavily in my prompts, and see used in other community prompts). The scroll-type block was something I especially loved; I use it for changing how many words I want on the fly. In a chat, having the prompt live in a place outside of it at first felt awkward. But with the toggleable blocks and the scroll, it felt more polished to me. Yes, I know that's not quantifiable. No, I will not elaborate. ~~(I would absolutely elaborate if anyone asked)~~

**Ask**

The Ask mode is small and single-use, which is why it lives as a single icon at the bottom of the navbar. Basically, it's a no-frills way to just send a message to your LLM backend. It exists because I had a Narrator card in SillyTavern that I only used for asking questions, so I made it a feature. You may notice you can load a character to "be" the Assistant. If you remember Stella from the c.ai days, you're essentially putting your character in her role.

## Where data goes

Everything stays in your browser, with one exception. On the live site, multiplayer messages pass through a relay server run by the me (Supabase Realtime). They are not stored there, and they are carried in plaintext. API keys are never sent to the relay.

A host can point a session at a Centrifugo relay on their own machine instead, set up in Settings under Multiplayer. [Click here for more information.](src/resources/self-hosted-relay.md)

## Stack

Vite, React, TypeScript, Zustand, Dexie (IndexedDB), React Router.

## Development

```bash
pnpm install
pnpm dev
```

```bash
pnpm build
```

## AI assistance

Agentic LLM coding assistants were used on this codebase, and wrote a majority of it. The creative ideas like the feature set, the interaction design, what this app is and isn't are mine. I just wanted to be upfront with that.

More on this in the [foreword](FOREWORD.md).

## License

GNU GPL v3. See [LICENSE](LICENSE).

```
Copyright (C) 2026 nessuvia

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
this program. If not, see <https://www.gnu.org/licenses/>.
```

Real documentation coming soon™.
