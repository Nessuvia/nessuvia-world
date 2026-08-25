# Nessu's Tavern

A character chat app inspired by SillyTavern. It runs entirely in the browser. Chats, characters,
and settings live in IndexedDB. Model requests go from your browser to an OpenAI-compatible
endpoint using the key you provide.

There is no backend and there are no accounts. Text Completion is coming soon.

It installs as a PWA and runs from the home screen on mobile.

## Why?
I made this for myself after a long time of using SillyTavern. I'll say straight up I have nothing but appreciation for everyone who's contributed to the codebase in any way — it's an amazing application. With that said, I made Nessu's Tavern/nessuvia.world because I wanted a statically served frontend I could access from any device with internet access, and I wanted my saves to be easily portable. The portability is the main reason behind most of the weird limitations, like how the Character Gallery only accepts links and not uploading your own pictures. Keeping links is just way, way smaller in size (I'm not against some image uploads, like Persona or Character avatars).

**Mobile**

Mobile support was something that started small, but I fully intend to make it a first-class feature. Nessu's Tavern is supported as a PWA, so you can add it to the home screen of your mobile devices and use it in full screen, inspired by ST-android.

**Palette**

The Palette feature was born from the fun I had making custom CSS in SillyTavern, extended into a technical menu with built-in font loading, app-wide text colors, panel style, etc. The custom HTML and CSS backgrounds were directly inspired by SillyTavern's custom CSS loading. As a web dev, I knew it could have more potential if we allowed some scoped CSS and the ability to place HTML elements, so that's where that came from.

**Chat**

The Chat is the most "standard" feature I have. It's got support for (I think) everything in the Tavern V2 specification, as well as some quality-of-life features I love, like Alternate Descriptions, a Gallery, per-character text coloring, etc. The lorebooks are very barebones; sorry, I don't use character lorebooks much at all, so it hasn't gotten much love. (Though with a nice UI, I may be tempted to try them out more!)

**Write**

The Write feature is probably most reminiscent of NovelAI's writing mode (though I only used it for a week in 2022). The biggest concept to understand is the Narrator role: a DM/GM that reads your directive, sees the descriptions of characters you've added, and responds. You and the LLM both write on a single sheet or "Story," which you can split into Chapters for context management, or any other reason.

**Prompts**

The prompt handling is another feature inspired by SillyTavern. I wanted prompt "blocks" that were reusable, easily rearranged, and supported XML-style tagging (which I use heavily in my prompts, and see used in other community prompts). The scroll-type block was something I especially loved; I use it for changing how many words I want on the fly. In a chat, having the prompt live in a place outside of it at first felt awkward. But with the toggleable blocks and the scroll, it felt more polished to me. Yes, I know that's not quantifiable. No, I will not elaborate (I would absolutely elaborate if anyone asked).

**Ask**

The Ask mode is small and single-use, which is why it lives as a single icon at the bottom of the navbar. Basically, it's a no-frills way to just send a message to your LLM backend. It exists because I had a Narrator card in SillyTavern that I only used for asking questions, so I made it a feature. You may notice you can load a character to "be" the Assistant. If you remember Stella from the c.ai days, you're essentially putting your character in her role.

The service and software are provided on an 'AS IS' and 'AS AVAILABLE' basis, without warranties of any kind, either operational or functional.

Real documention coming soon™.

## Where data goes

Everything stays in your browser, with one exception. On the live site, multiplayer messages pass through a relay server run by the me (Supabase Realtime). They are not stored there, and they are carried in plaintext. API keys are never sent to the relay.

A host can point a session at a Centrifugo relay on their own machine instead, set up in Settings under Multiplayer. See `src/resources/self-hosted-relay.md`.

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

## License

MIT. See [LICENSE](LICENSE).
