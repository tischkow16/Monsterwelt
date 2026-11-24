# Baut index.html für GitHub Pages: fertiges Spiel + App-Funktionen (PWA)
src = open('/home/claude/game/monsterwelt.html', encoding='utf-8').read()
head = '''<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#2d3142">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Monsterwelt">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="icon" type="image/png" href="icons/icon-192.png">
<script>window.MW_PWA = true; if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>
'''
assert '</head>' in src
out = src.replace('</head>', head + '</head>', 1)
open('/home/claude/monsterwelt/index.html', 'w', encoding='utf-8').write(out)
print('index.html', len(out))
