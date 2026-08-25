const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Xenia Nessuvia</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Xenia Nessuvia">
<meta property="og:title" content="Xenia Nessuvia">
<meta property="og:description" content="The home for Xenia Nessuvia.">
<meta property="og:url" content="https://nessuvia.com/">
<meta property="og:image" content="https://xenia.nessuvia.com/android-chrome-512x512.png">
<meta name="theme-color" content="#6c6cff">
<style>
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 1rem;
    background: #111; color: #eee;
    font-family: system-ui, sans-serif;
  }
  a { color: #888; font-size: 0.875rem; }
</style>
</head>
<body>
  <h1>Coming soon…</h1>
  <a href="https://xenia.nessuvia.com">(dev build)</a>
</body>
</html>
`;

export default {
  fetch() {
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  },
};
