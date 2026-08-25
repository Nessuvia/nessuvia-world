// Run: node --experimental-strip-types src/app/checkDrawerSwipe.ts
import assert from 'node:assert'
import { anyOtherDrawerOpen, clampDrag, markDrawerOpen, settleDrawer, towardOpen } from './drawerSwipe.ts'

const width = 400

// --- clampDrag ------------------------------------------------------------
// Closed tracks the pull toward open and stops at the far edge.
assert.strictEqual(clampDrag(false, 0, width), 0)
assert.strictEqual(clampDrag(false, 120, width), 120)
assert.strictEqual(clampDrag(false, 900, width), width)
// Dragging left on a closed drawer does nothing — it is already as closed as it gets.
assert.strictEqual(clampDrag(false, -120, width), 0)

// Open is the mirror: pulling away brings it back, pulling further is already at rest.
assert.strictEqual(clampDrag(true, 0, width), width)
assert.strictEqual(clampDrag(true, -120, width), 280)
assert.strictEqual(clampDrag(true, -900, width), 0)
assert.strictEqual(clampDrag(true, 120, width), width)

// --- settleDrawer ---------------------------------------------------------
// A flick opens on speed alone, well short of the distance a slow drag would need.
assert.strictEqual(settleDrawer({ startOpen: false, pull: 20, width, elapsed: 30 }), true)
// The same 20px taken slowly does not.
assert.strictEqual(settleDrawer({ startOpen: false, pull: 20, width, elapsed: 600 }), false)
// Nor does a slow drag that stops short of a third of the width.
assert.strictEqual(settleDrawer({ startOpen: false, pull: 100, width, elapsed: 600 }), false)
assert.strictEqual(settleDrawer({ startOpen: false, pull: 200, width, elapsed: 600 }), true)

// Closing reads the same in reverse.
assert.strictEqual(settleDrawer({ startOpen: true, pull: -20, width, elapsed: 30 }), false)
assert.strictEqual(settleDrawer({ startOpen: true, pull: -100, width, elapsed: 600 }), true)
assert.strictEqual(settleDrawer({ startOpen: true, pull: -200, width, elapsed: 600 }), false)

// A drag the wrong way leaves the state alone however fast it was — no accidental reversal.
assert.strictEqual(settleDrawer({ startOpen: false, pull: -300, width, elapsed: 20 }), false)
assert.strictEqual(settleDrawer({ startOpen: true, pull: 300, width, elapsed: 20 }), true)
// Neither does a touch that never moved.
assert.strictEqual(settleDrawer({ startOpen: false, pull: 0, width, elapsed: 200 }), false)
assert.strictEqual(settleDrawer({ startOpen: true, pull: 0, width, elapsed: 200 }), true)

// Two touch events can share a timestamp; that must not divide by zero into a NaN comparison.
assert.strictEqual(settleDrawer({ startOpen: false, pull: 15, width, elapsed: 0 }), true)
assert.strictEqual(settleDrawer({ startOpen: false, pull: -15, width, elapsed: 0 }), false)

// A narrow screen scales with it rather than carrying a fixed pixel threshold.
assert.strictEqual(settleDrawer({ startOpen: false, pull: 90, width: 240, elapsed: 600 }), true)
assert.strictEqual(settleDrawer({ startOpen: false, pull: 90, width: 800, elapsed: 600 }), false)

// --- towardOpen -----------------------------------------------------------
// A left drawer opens with a left-to-right drag; a right drawer is the mirror of it.
assert.strictEqual(towardOpen('left', 40), 40)
assert.strictEqual(towardOpen('left', -40), -40)
assert.strictEqual(towardOpen('right', -40), 40)
assert.strictEqual(towardOpen('right', 40), -40)

// The same swipe cannot open a left drawer and close a right one: run both through towardOpen and
// only the one whose state the drag moves toward comes out positive.
assert.strictEqual(settleDrawer({ startOpen: false, pull: towardOpen('right', 300), width, elapsed: 200 }), false)
assert.strictEqual(settleDrawer({ startOpen: false, pull: towardOpen('left', 300), width, elapsed: 200 }), true)

// --- the open-drawer registry --------------------------------------------
const navbar = {}
const panel = {}
assert.strictEqual(anyOtherDrawerOpen(navbar), false)
const closeNavbar = markDrawerOpen(navbar)
// The open drawer still owns its own gesture; everything else stands down while it is up.
assert.strictEqual(anyOtherDrawerOpen(navbar), false)
assert.strictEqual(anyOtherDrawerOpen(panel), true)
closeNavbar()
assert.strictEqual(anyOtherDrawerOpen(panel), false)
// Closing twice must not take a later drawer's entry with it.
const closePanel = markDrawerOpen(panel)
closeNavbar()
assert.strictEqual(anyOtherDrawerOpen(navbar), true)
closePanel()
assert.strictEqual(anyOtherDrawerOpen(navbar), false)

console.log('checkDrawerSwipe ok')
