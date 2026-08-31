// node --experimental-strip-types src/core/prompt/checkBeatWeights.ts
import assert from 'node:assert'
import type { BeatWeight } from '../storage/types.ts'
import { asWeight, beatTargets, splitByWeight, weightMultiplier } from './beatWeights.ts'

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)

// Empty and unset.
assert.deepEqual(splitByWeight(1000, []), [])
assert.deepEqual(splitByWeight(0, ['normal', 'major']), [0, 0])
assert.deepEqual(splitByWeight(-5, ['normal']), [0, 0].slice(0, 1))

// A single beat takes the whole target whatever its weight.
for (const w of ['sketch', 'major'] as BeatWeight[]) {
  assert.deepEqual(splitByWeight(900, [w]), [900])
}

// Equal weights divide evenly, and the parts still sum exactly when they do not divide.
assert.deepEqual(splitByWeight(1000, ['normal', 'normal', 'normal', 'normal']), [250, 250, 250, 250])
assert.equal(sum(splitByWeight(1000, ['normal', 'normal', 'normal'])), 1000)
assert.equal(sum(splitByWeight(1237, ['sketch', 'brief', 'normal', 'long', 'major'])), 1237)

// All-sketch is still the whole chapter: weights are relative, not absolute.
assert.equal(sum(splitByWeight(2000, ['sketch', 'sketch', 'sketch'])), 2000)
assert.deepEqual(splitByWeight(2000, ['sketch', 'sketch']), [1000, 1000])

// A heavier beat gets more than a lighter one, in the right order.
const mixed = splitByWeight(10000, ['sketch', 'normal', 'major'])
assert.equal(sum(mixed), 10000)
assert.ok(mixed[0] < mixed[1] && mixed[1] < mixed[2], `not ascending: ${mixed}`)
// And roughly in proportion: major over sketch is the ratio of their multipliers.
const ratio = mixed[2] / mixed[0]
const want = weightMultiplier.major / weightMultiplier.sketch
assert.ok(Math.abs(ratio - want) < 0.05, `ratio ${ratio} vs ${want}`)

// Every split sums exactly, over a spread of totals and shapes.
const shapes: BeatWeight[][] = [
  ['normal'],
  ['brief', 'major'],
  ['major', 'sketch', 'sketch', 'long'],
  ['sketch', 'brief', 'normal', 'long', 'major', 'normal', 'brief'],
]
for (const shape of shapes) {
  for (const total of [1, 7, 99, 1000, 1237, 54321]) {
    const parts = splitByWeight(total, shape)
    assert.equal(parts.length, shape.length)
    assert.equal(sum(parts), total, `${total} over ${shape.join(',')} gave ${parts}`)
    assert.ok(parts.every((n) => n >= 0), `negative part in ${parts}`)
  }
}

// asWeight coerces model output, and never throws a beat away over a bad field.
assert.equal(asWeight('MAJOR'), 'major')
assert.equal(asWeight('  long '), 'long')
assert.equal(asWeight('enormous'), 'normal')
assert.equal(asWeight(undefined), 'normal')
assert.equal(asWeight(3), 'normal')

// beatTargets reads a Chapter and lines up with blocks order.
const chapter = {
  targetWords: 3000,
  blocks: [
    { id: 'a', beat: '', weight: 'brief' as BeatWeight, content: '', context: 'both' as const },
    { id: 'b', beat: '', weight: 'major' as BeatWeight, content: '', context: 'both' as const },
  ],
}
const targets = beatTargets(chapter)
assert.equal(sum(targets), 3000)
assert.ok(targets[1] > targets[0])

console.log('checkBeatWeights ok')
