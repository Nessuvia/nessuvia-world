import assert from 'node:assert'
import { isBackgroundImageRef } from './sanitizeHtml.ts'

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

console.log('checkImageRef ok')
