<?php
/**
 * Muss im Aufbau zu kita-app/index.html passen (die lokale Demo-Version).
 * @var array $_
 */
$url = \OCP\Server::get(\OCP\IURLGenerator::class);
// Änderungszeit als Versionsnummer, damit Handys nach einem Update nicht die alte Datei behalten
$asset = fn (string $path): string => $url->linkTo('kitaapp', $path) . '?v=' . @filemtime(__DIR__ . '/../' . $path);
?><!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>KiTa</title>
  <meta name="theme-color" content="#2F5B40">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="KiTa">
  <link rel="manifest" href="<?php p($_['manifest']); ?>">
  <link rel="icon" href="<?php p($asset('img/app.svg')); ?>" type="image/svg+xml">
  <link rel="apple-touch-icon" href="<?php p($_['touchIcon']); ?>">
  <link rel="stylesheet" href="<?php p($asset('css/app.css')); ?>">
</head>
<body data-config="<?php p($_['config']); ?>">
  <header class="topbar">
    <button class="back" id="back" hidden aria-label="Zurück">‹</button>
    <h1 id="title">KiTa</h1>
    <span class="demo-badge" id="demo-badge" hidden>Demo</span>
    <button class="search-btn" id="search-btn" aria-label="Suchen"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg></button>
  </header>

  <main id="view" tabindex="-1"></main>

  <nav class="tabbar" aria-label="Hauptnavigation">
    <a href="#/start" data-tab="start"><span class="ico">🏡</span><span>Start</span></a>
    <a href="#/termine" data-tab="termine"><span class="ico">📅</span><span>Termine</span></a>
    <a href="#/chat" data-tab="chat"><span class="ico">💬</span><span>Chat</span></a>
    <a href="#/kontakte" data-tab="kontakte"><span class="ico">📇</span><span>Kontakte</span></a>
    <a href="#/handbuch" data-tab="handbuch"><span class="ico">📖</span><span>Handbuch</span></a>
  </nav>

  <script nonce="<?php p($_['nonce']); ?>" src="<?php p($asset('js/releases.js')); ?>"></script>
  <script nonce="<?php p($_['nonce']); ?>" src="<?php p($asset('js/api.js')); ?>"></script>
  <script nonce="<?php p($_['nonce']); ?>" src="<?php p($asset('js/app.js')); ?>"></script>
</body>
</html>
