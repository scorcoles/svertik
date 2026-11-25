<?php
// svertik link shortener: short share links for editor scenes, with a preview card for chats and social sites.
//
//   POST /            body: the encoded scene (the editor's #p=… text: deflate-raw, base64url), text/plain
//                     → 201 { "id": "…", "url": "https://link.example/…" }
//   POST /<id>.jpg    body: its preview, a JPEG (1200 × 630) → 201, or 200 if it already has one
//   GET  /<id>        → a page that opens the Play page (#l=<id>) (shared from Play)
//   GET  /e/<id>      → a page that opens the editor (#e=<id>) (shared from the editor)
//   GET  /<id>.txt    → the encoded scene (read by the Play page and the editor)
//   GET  /<id>.jpg    → its preview
//
// The pages for /<id> and /e/<id> carry Open Graph tags (title, preview image) for link previews, since chat
// apps and social sites read the HTML and never run its script; people are sent on at once.
// A scene's id comes from a hash of its content, so sharing the same scene twice gives the same link and
// nothing is overwritten. A preview, once set, stays: nobody can swap the image behind someone else's link.
// Scenes are stored as plain files: no database. Only valid svertik scenes and JPEG previews are accepted,
// so it cannot be used to host arbitrary files.
// Configuration through environment variables (fastcgi_param in nginx), see README.md.

declare(strict_types=1);

$DATA = getenv('SVERTIK_LINK_DATA') ?: __DIR__ . '/data';
$PLAY = getenv('SVERTIK_LINK_PLAY') ?: 'https://editor.svertik.com/play.html';
$EDIT = getenv('SVERTIK_LINK_EDIT') ?: 'https://editor.svertik.com/';
$ORIGINS = array_filter(array_map('trim', explode(',', getenv('SVERTIK_LINK_ORIGINS') ?: 'https://editor.svertik.com')));
const MAX_ENCODED = 4 * 1024 * 1024;   // bytes of encoded text accepted in a POST
const MAX_JSON = 32 * 1024 * 1024;     // bytes the scene may inflate to
const MAX_PREVIEW = 2 * 1024 * 1024;   // bytes of a preview image
const MAX_PREVIEW_SIDE = 2400;         // px
const ID_LENGTH = 10;

function reply(int $status, string $body = '', string $type = 'application/json'): never {
  http_response_code($status);
  header("Content-Type: $type" . (str_starts_with($type, 'image/') ? '' : '; charset=utf-8'));
  header('X-Content-Type-Options: nosniff');
  echo $body;
  exit;
}
function fail(int $status, string $message): never {
  reply($status, json_encode(['error' => $message]));
}

/** base62 of the first 56 bits of a SHA-256 (they fit in a PHP int): short, URL-safe, case-sensitive. */
function idOf(string $bytes): string {
  $alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  $n = hexdec(substr(hash('sha256', $bytes), 0, 14));
  $id = '';
  for ($i = 0; $i < ID_LENGTH; $i++) {
    $id .= $alphabet[$n % 62];
    $n = intdiv($n, 62);
  }
  return $id;
}
/** A stored file of a scene: `txt` the scene, `jpg` its preview, `name` its title. */
function pathOf(string $data, string $id, string $ext = 'txt'): string {
  return "$data/" . substr($id, 0, 2) . "/$id.$ext";
}
/** Write next to it and rename: a reader never sees half a file. False if it could not be written. */
function store(string $file, string $bytes): bool {
  if (!is_dir(dirname($file)) && !mkdir(dirname($file), 0750, true) && !is_dir(dirname($file))) return false;
  $tmp = $file . '.' . bin2hex(random_bytes(6)) . '.tmp';
  if (file_put_contents($tmp, $bytes) === false || !rename($tmp, $file)) {
    @unlink($tmp);
    return false;
  }
  return true;
}
/** The scene's state ({ scene, name, … }) from its encoded text, or null. */
function decode(string $encoded): ?array {
  $bytes = base64_decode(strtr($encoded, '-_', '+/'), true);
  $json = $bytes === false ? false : @gzinflate($bytes, MAX_JSON);
  $state = $json === false ? null : json_decode($json, true, 512);
  return is_array($state) ? $state : null;
}
function nameOf(?array $state): string {
  $name = is_array($state) && is_string($state['name'] ?? null) ? trim(preg_replace('/\.svg$/i', '', $state['name'])) : '';
  return mb_substr($name !== '' ? $name : 'Untitled', 0, 120);
}
function allowOrigin(array $origins, string $origin): void {
  if (!in_array($origin, $origins, true)) fail(403, 'Origin not allowed');
  header("Access-Control-Allow-Origin: $origin");
  header('Vary: Origin');
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$scheme = (($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') ? 'https' : 'http';
$base = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');

if ($method === 'OPTIONS') {
  // The editor sends simple requests (no preflight); answer one anyway for other clients.
  if (in_array($origin, $ORIGINS, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Methods: GET, POST');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Vary: Origin');
  }
  reply(204, '', 'text/plain');
}

if ($method === 'POST' && $path === '/') {
  allowOrigin($ORIGINS, $origin);
  $encoded = trim((string) file_get_contents('php://input', false, null, 0, MAX_ENCODED + 1));
  if ($encoded === '' || strlen($encoded) > MAX_ENCODED) fail(413, 'Scene too large');
  if (!preg_match('/^[A-Za-z0-9_-]+$/', $encoded)) fail(400, 'Not an encoded scene');
  $state = decode($encoded);
  $scene = $state['scene'] ?? null;
  if (!is_array($scene) || ($scene['version'] ?? null) !== 1 || !is_array($scene['objects'] ?? null)) {
    fail(422, 'Not a svertik scene');
  }
  $id = idOf($encoded);
  $file = pathOf($DATA, $id);
  if (is_file($file)) {
    // Same id, other scene (a hash collision): refuse rather than hand out someone else's scene.
    if (file_get_contents($file) !== $encoded) fail(409, 'Link collision, change the scene slightly');
  } elseif (!store($file, $encoded) || !store(pathOf($DATA, $id, 'name'), nameOf($state))) {
    fail(500, 'Storage unavailable');
  }
  reply(201, json_encode(['id' => $id, 'url' => "$base/$id"], JSON_UNESCAPED_SLASHES));
}

if ($method === 'POST' && preg_match('~^/([A-Za-z0-9]{' . ID_LENGTH . '})\.jpg$~', $path, $m)) {
  allowOrigin($ORIGINS, $origin);
  if (!is_file(pathOf($DATA, $m[1]))) fail(404, 'No scene with this link');
  $preview = pathOf($DATA, $m[1], 'jpg');
  // The first preview stays.
  if (is_file($preview)) reply(200, json_encode(['preview' => "$base/{$m[1]}.jpg"], JSON_UNESCAPED_SLASHES));
  $image = (string) file_get_contents('php://input', false, null, 0, MAX_PREVIEW + 1);
  if ($image === '' || strlen($image) > MAX_PREVIEW) fail(413, 'Preview too large');
  $info = @getimagesizefromstring($image);
  if (!$info || $info[2] !== IMAGETYPE_JPEG || $info[0] < 1 || $info[1] < 1 || $info[0] > MAX_PREVIEW_SIDE || $info[1] > MAX_PREVIEW_SIDE) {
    fail(422, 'Not a JPEG preview');
  }
  if (!store($preview, $image)) fail(500, 'Storage unavailable');
  reply(201, json_encode(['preview' => "$base/{$m[1]}.jpg"], JSON_UNESCAPED_SLASHES));
}

if ($method === 'GET' || $method === 'HEAD') {
  if ($path === '/') {
    header('Location: ' . preg_replace('~/play\.html$~', '/', $PLAY), true, 302);
    exit;
  }
  if (preg_match('~^/([A-Za-z0-9]{' . ID_LENGTH . '})\.(txt|jpg)$~', $path, $m)) {
    $file = pathOf($DATA, $m[1], $m[2]);
    if (!is_file($file)) fail(404, $m[2] === 'jpg' ? 'No preview for this link' : 'No scene with this link');
    // Neither ever changes under its id: cache them for good. Public, so any page may read them.
    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: public, max-age=31536000, immutable');
    reply(200, (string) file_get_contents($file), $m[2] === 'jpg' ? 'image/jpeg' : 'text/plain');
  }
  // The same stored scene opens in the editor (/e/<id>) or in Play (/<id>).
  if (preg_match('~^/(e/)?([A-Za-z0-9]{' . ID_LENGTH . '})$~', $path, $m)) {
    [$edit, $id] = [$m[1] !== '', $m[2]];
    $file = pathOf($DATA, $id);
    if (!is_file($file)) fail(404, 'No scene with this link');
    $target = $edit ? "$EDIT#e=$id" : "$PLAY#l=$id";
    // The title, kept when the link was made (or read once from scenes made before that).
    $nameFile = pathOf($DATA, $id, 'name');
    $name = is_file($nameFile) ? (string) file_get_contents($nameFile) : nameOf(decode((string) file_get_contents($file)));
    if (!is_file($nameFile)) store($nameFile, $name);
    $hasPreview = is_file(pathOf($DATA, $id, 'jpg'));
    $h = fn (string $s) => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $title = $h($name);
    $description = $edit ? 'Open it in the svertik editor.' : 'Play it in svertik.';
    $url = $h("$base/" . ($edit ? 'e/' : '') . $id);
    $image = $hasPreview ? $h("$base/$id.jpg") : '';
    $go = $h($target);
    $script = json_encode($target, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
    $tags = $hasPreview
      ? "<meta property=\"og:image\" content=\"$image\">\n<meta property=\"og:image:width\" content=\"1200\">\n<meta property=\"og:image:height\" content=\"630\">\n<meta property=\"og:image:alt\" content=\"$title\">\n<meta name=\"twitter:card\" content=\"summary_large_image\">\n<meta name=\"twitter:image\" content=\"$image\">"
      : '<meta name="twitter:card" content="summary">';
    // A preview may arrive just after the link is first opened: keep this page fresh for a few minutes only.
    header('Cache-Control: public, max-age=300');
    header("Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'");
    header('Referrer-Policy: no-referrer');
    reply(200, <<<HTML
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>$title · svertik</title>
<meta name="description" content="$description">
<meta property="og:type" content="website">
<meta property="og:site_name" content="svertik">
<meta property="og:title" content="$title">
<meta property="og:description" content="$description">
<meta property="og:url" content="$url">
$tags
<meta name="twitter:title" content="$title">
<meta name="twitter:description" content="$description">
<meta http-equiv="refresh" content="0;url=$go">
<script>location.replace($script)</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0d10;color:#ededed;font:14px/1.6 'Commit Mono',ui-monospace,monospace}a{color:inherit}</style>
</head>
<body><a href="$go">Open “{$title}” in svertik</a></body>
</html>
HTML, 'text/html');
  }
  fail(404, 'Not found');
}

fail(405, 'Method not allowed');
