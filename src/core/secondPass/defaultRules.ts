// Extension-ful imports on purpose: checkDefaultRules.ts runs this under `node --experimental-strip-types`.
import type { RepetitionSettings, SecondPassRule, SprawlSettings } from '../stores/settingsStore.ts'

/**
 * The bundled rules, adapted from AI Writing Rules by Abdulkader Safi.
 *
 *   https://github.com/Abdulkader-Safi/AI-Writing-Rules
 *
 *   MIT License. Copyright (c) 2026 Abdulkader Safi.
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 *   and associated documentation files (the "Software"), to deal in the Software without
 *   restriction, including without limitation the rights to use, copy, modify, merge, publish,
 *   distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 *   Software is furnished to do so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in all copies or
 *   substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 *   BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 *   NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 *   DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Twenty-four of the original twenty-nine patterns are here. The five left out (heading tells,
 * excessive bold, forced tables, outline-shaped endings, treating the title as a thing) are about
 * document structure, and a chat reply or a story block has no headings or tables for them to be
 * about. Carrying them would spend prompt tokens describing a problem that cannot occur.
 *
 * Sixteen carry a `find` and only speak up when they match, which keeps them free on a clean reply
 * and lets `skipWhenClean` still skip. The other nine are judgments with nothing to match on, so
 * they go to the model on every pass.
 */

/** A rule that only speaks when its pattern matches. */
function match(id: string, label: string, find: string, note: string): SecondPassRule {
  return {
    id: `default:${id}`,
    enabled: true,
    label,
    find,
    regex: true,
    caseSensitive: false,
    scope: 'assistant',
    note,
  }
}

/** A rule with nothing to match on, applied to every reply. */
function always(id: string, label: string, note: string): SecondPassRule {
  return {
    id: `default:${id}`,
    enabled: true,
    label,
    find: '',
    regex: false,
    caseSensitive: false,
    scope: 'assistant',
    note,
  }
}

export function defaultSecondPassRules(): SecondPassRule[] {
  return [
    // --- matched -----------------------------------------------------------
    match(
      'ai-vocabulary',
      'AI vocabulary',
      String.raw`\b(delve|tapestry|vibrant|multifaceted|nuanced|intricate|realm|landscape|testament|navigate|foster|leverage|robust|seamless|underscore|pivotal|crucial|comprehensive|holistic|transformative|elevate|embark|unlock|harness|showcase|resonate|garner|boast|meticulous|bolster|streamline|empower|myriad|plethora|paradigm|interplay|groundbreaking|cutting-edge|world-class)\w*\b`,
      'This is a word that marks text as machine-written. Replace it with the plain word you actually mean. "Landscape" and "navigate" are fine in their literal senses, a real landscape or actually walking somewhere, and only a problem as figures of speech.',
    ),
    match(
      'verb-inflation',
      'Inflated verbs',
      String.raw`\b(utiliz\w*|leverag\w*|facilitat\w*|optimiz\w*|initiat\w*|terminat\w*|ascertain\w*|commenc\w*|endeavou?r\w*|regarding|prior to|in order to|a number of)\b`,
      'An inflated word where a plain one works: use, help, speed up, start, end, find out, about, before, to. Say the smaller word.',
    ),
    match(
      'copula-avoidance',
      'Dodging "is"',
      String.raw`\b(serves? as|stands? as|functions? as|operates? as|boasts|is a testament to)\b`,
      'This dresses up a plain statement of fact. Say what the thing is, with "is" or "has", instead of routing it through a verb of standing or serving.',
    ),
    match(
      'negative-parallelism',
      'Negative parallelism',
      String.raw`\bnot (just|only|merely|simply)\b|\bit'?s not [^.!?]{0,40}?,\s*(it'?s|but)\b`,
      'Kill the "not X, but Y" construction. Delete the negation and keep the positive half. If the positive half cannot stand on its own, the sentence had no content and should go.',
    ),
    match(
      'puffed-significance',
      'Puffed significance',
      String.raw`\b(plays? a (crucial|pivotal|vital|key) role|underscores? the importance|reflects? a broader|setting the stage for|marks? a significant milestone|a key turning point|the evolving landscape|left an indelible mark|deeply rooted in|in the broader context of)\b`,
      'This inflates something ordinary by tying it to a grand theme. State what happened and cut the clause explaining why it matters. If the significance is real, name a consequence.',
    ),
    match(
      'participle-commentary',
      'Trailing "-ing" commentary',
      String.raw`,\s+(highlighting|underscoring|emphasi[sz]ing|ensuring|reflecting|symboli[sz]ing|contributing to|cultivating|fostering|encompassing|enhancing|showcasing|aligning with|resonating with|allowing for|paving the way for)\b`,
      'A trailing participle clause that comments on the sentence it is attached to. Cut it, or make it its own sentence with a real subject.',
    ),
    match(
      'vague-attribution',
      'Vague attribution',
      String.raw`\b(experts (say|agree|believe)|studies have shown|research (suggests|shows)|it is widely (believed|known)|many believe|some argue)\b`,
      'Name who said it or drop the claim.',
    ),
    match(
      'empty-openers',
      'Empty openers',
      String.raw`\b(in today'?s [\w\s-]{0,20}world|in the digital age|in an era of|picture this|imagine a world where|we live in a time when|now more than ever|it'?s no secret that|as technology continues to evolve|let'?s face it)\b`,
      'A warm-up that sets a scene instead of saying something. Delete it and start with the thing that happened.',
    ),
    match(
      'pseudo-wisdom',
      'Pseudo-wisdom filler',
      String.raw`\b(the key is to find the right balance|comes down to consistency|at the end of the day,? it depends|true growth comes from within|context is everything|there'?s no one-size-fits-all|the best approach is the one that works)\b`,
      'This sounds like insight and carries none. Cut it, or replace it with the specific version that could actually be wrong.',
    ),
    match(
      'transition-stacking',
      'Stacked transitions',
      String.raw`(^|\n)\s*(Furthermore|Moreover|Additionally|In addition|Consequently|Nevertheless|Nonetheless|Ultimately|Notably|Importantly|That said|Indeed|Thus|Hence)\b,?`,
      'A sentence opening on a connective adverb. Cut the opener; the connection is usually already clear from the order of the sentences.',
    ),
    match(
      'em-dash',
      'Em dashes',
      String.raw`[—–]`,
      'No em dashes or en dashes. Use a full stop, a comma, a colon, or brackets. A hyphen inside a word is fine.',
    ),
    match(
      'curly-quotes',
      'Curly quotes',
      String.raw`[‘’“”…]`,
      'Straight quotes and apostrophes only, and three dots rather than an ellipsis character.',
    ),
    match(
      'hedging',
      'Stacked hedges',
      String.raw`\b(it could be argued that|some might say|in many cases|generally speaking|it is often the case that|may potentially|can sometimes|arguably|to some extent|in certain contexts|one could reasonably conclude)\b`,
      'A qualifier draining the claim of content. One hedge is honest; stacked hedges refuse to say anything. Make the claim or drop it.',
    ),
    match(
      'assistant-scaffolding',
      'Assistant scaffolding',
      String.raw`(Certainly!|Of course!|Great question|I hope this helps|As an AI|I'?m just an AI|Let me know if you)`,
      'Chat-assistant furniture that does not belong in the text. Cut it and leave the substance.',
    ),
    match(
      'model-artifacts',
      'Model artifacts',
      String.raw`(contentReference|oaicite|oai_citation|turn\d+search\d+|attributableIndex|\[cite: ?\d+\]|grok_card|grok_render|ppl-ai-file-upload|:::writing|utm_source=)`,
      'A leaked generation artifact. Delete it outright.',
    ),
    match(
      'canned-summaries',
      'Canned summaries',
      String.raw`\b(in conclusion|to sum up|in summary|as we look ahead|to wrap up|all in all)\b`,
      'No wrap-up ending. End at the last real sentence rather than restating what came before.',
    ),

    // --- always ------------------------------------------------------------
    always(
      'cut-the-word',
      'Cut what carries nothing',
      'If a word can be cut and the meaning survives, cut it.',
    ),
    always(
      'rule-of-three',
      'Break the rule of three',
      'Count the items in every list. If there are exactly three, use one, two, or four instead. This applies to bullets, adjective strings, and clauses in a sentence.',
    ),
    always(
      'burstiness',
      'Vary sentence length',
      'Vary sentence length. A three-word sentence is legitimate, and so is a forty-word one that carries a long thought through several clauses before it lands. Paragraph after paragraph of eighteen to twenty-four word sentences is the strongest tell there is.',
    ),
    always(
      'punctuation-thinness',
      'Vary punctuation',
      'Do not lean on commas and "and" for every join. Use full stops, colons, and brackets.',
    ),
    always(
      'deletion-test',
      'Every sentence earns its place',
      'Every sentence should carry a fact, a number, a cause, or a concrete example. Delete each in turn: if nothing is lost, it was filler and should stay deleted.',
    ),
    always(
      'elegant-variation',
      'One name per thing',
      'Repeat the real word rather than reaching for a synonym. "The app, the platform, the solution" reads as padding and makes the reader wonder whether they are the same thing. Pick one name and use pronouns for the rest.',
    ),
    always(
      'narrow-vocabulary',
      'Widen the word range',
      'Do not circle the same handful of words and constructions. Reach for the specific word the thing actually needs.',
    ),
    always(
      'promotional-language',
      'No promotional language',
      'Nothing that praises what is being described: simply, just, effortlessly, powerful, flawless, smart. State what it does and stop.',
    ),
    always(
      'register-mismatch',
      'Match the audience',
      'Pitch the register at whoever is being addressed, and keep it there. A question with a one-line answer gets a one-line answer.',
    ),
  ]
}

/**
 * Everything the bundle ships: the rules, plus the two built-in checks, which are settings rather
 * than rules but are just as much part of "the defaults". Restoring puts back all three, so there
 * is one shipped state and one action that returns to it.
 */
export interface RuleBundle {
  rules: SecondPassRule[]
  repetition: RepetitionSettings
  sprawl: SprawlSettings
}

export function defaultBundle(): RuleBundle {
  return {
    rules: defaultSecondPassRules(),
    repetition: { enabled: true, phrase: 4, repeats: 2, lookback: 8 },
    sprawl: { enabled: true, maxWords: 45, maxCommas: 4, maxConjunctions: 3 },
  }
}

/** What a row is, ignoring which bundle it came from. Two rows with the same find and the same note
 *  say the same thing to the model, whatever their ids are. */
function signature(rule: SecondPassRule): string {
  // JSON rather than a joined string: a find is a regex and could contain any separator I picked.
  return JSON.stringify([rule.find.trim(), rule.note.trim()])
}

/**
 * The rules after a restore: what is there now, plus the bundled rules missing from it.
 *
 * Two rows are treated as the same rule if they share an id *or* say the same thing. The id check
 * covers the ordinary case. The content check covers the one the id check cannot see: a row left
 * over from an older bundle, or a copy made with the Copy button, both of which carry a different
 * id while being the same rule. Without it, restoring after a bundle change stacks a second copy of
 * every rule that survived the change.
 *
 * Nothing is removed and nothing is overwritten. A rule you edited keeps your wording, because its
 * id still matches.
 */
export function restoreBundle(current: SecondPassRule[]): SecondPassRule[] {
  const ids = new Set(current.map((r) => r.id))
  const signatures = new Set(current.map(signature))
  const missing = defaultSecondPassRules().filter(
    (d) => !ids.has(d.id) && !signatures.has(signature(d)),
  )
  return missing.length ? [...current, ...missing] : current
}

/**
 * Rows that came from a bundle this build no longer ships: the `default:` namespace, minus what is
 * in the bundle now. They are not duplicates of anything, so a restore leaves them alone; they are
 * surfaced separately so a list does not quietly end up holding two generations of defaults.
 */
export function staleBundledRules(current: SecondPassRule[]): SecondPassRule[] {
  const shipped = new Set(defaultSecondPassRules().map((r) => r.id))
  return current.filter((r) => r.id.startsWith('default:') && !shipped.has(r.id))
}
