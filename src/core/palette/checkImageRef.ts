import assert from 'node:assert'
import { isBackgroundImageRef } from './sanitizeHtml.ts'
import { substituteImageUrl } from './scopeCss.ts'

// The name that stands in for the slot's own image, with or without an extension.
for (const src of ['image.jpg', 'image.png', 'IMAGE.JPEG', 'image', ' image.webp ', 'image.svg']) {
  assert.equal(isBackgroundImageRef(src), true, src)
}

// Anything that names something else stays the URL the user wrote.
for (const src of [
  '',
  'images.jpg',
  'image.jpg.exe',
  'myimage.jpg',
  'a/image.jpg',
  'https://example.com/image.jpg',
  'data:image/png;base64,AAAA',
]) {
  assert.equal(isBackgroundImageRef(src), false, src)
}

// The CSS half of the same name: every url() spelling reaches the slot's image.
const src = 'data:image/png;base64,AAAA'
for (const written of [
  'url(image.jpg)',
  'url("image.png")',
  "url('image')",
  'url( image.webp )',
  'URL(IMAGE.JPEG)',
]) {
  assert.equal(
    substituteImageUrl(`.pageBackground { background-image: ${written}; }`, src),
    `.pageBackground { background-image: url("${src}"); }`,
    written,
  )
}

// Anything naming something else is left as the user wrote it, and so is every url() when the slot
// has no image — the panel validates with none in hand and must read back what was typed.
const other = '.a { background-image: url(https://example.com/image.jpg); }'
assert.equal(substituteImageUrl(other, src), other)
assert.equal(substituteImageUrl('.a { background-image: url(image.jpg); }', ''), '.a { background-image: url(image.jpg); }')

// Both url() tokens in one declaration, and the rest of the rule untouched.
assert.equal(
  substituteImageUrl('.a { background: url(image.jpg), url(bg.png); color: red; }', src),
  `.a { background: url("${src}"), url(bg.png); color: red; }`,
)

// An address holding a quote or a backslash can't close the string it lands in.
assert.equal(
  substituteImageUrl('.a { background-image: url(image); }', 'a".png'),
  '.a { background-image: url("a\\".png"); }',
)
assert.equal(
  substituteImageUrl('.a { background-image: url(image); }', 'a\\b.png'),
  '.a { background-image: url("a\\\\b.png"); }',
)

console.log('checkImageRef ok')
