<?php
// svertik link shortener: short share links for editor scenes.
//
//   POST /            body: the encoded scene (the editor's #p=… text: deflate-raw, base64url), text/plain
//                     → 201 { "id": "…", "url": "https://link.example/…" }
//   GET  /<id>        → 302 to the Play page with #l=<id>
//   GET  /<id>.txt    → the encoded scene (read by the Play page and the editor)
//
// A scene's id comes from a hash of its content, so sharing the same scene twice gives the same link and
// nothing is overwritten. Scenes are stored as plain files: no database. Only valid svertik scenes are
// accepted (it inflates and checks them), so it cannot be used to host arbitrary files.
// Configuration through environment variables (fastcgi_param in nginx), see README.md.

declare(strict_types=1);

$DATA = getenv('SVERTIK_LINK_DATA') ?: __DIR__ . '/data';
$PLAY = getenv('SVERTIK_LINK_PLAY') ?: 'https://editor.svertik.com/play.html';
$ORIGINS = array_filter(array_map('trim', explode(',', getenv('SVERTIK_LINK_ORIGINS') ?: 'https://editor.svertik.com')));
const MAX_ENCODED = 4 * 1024 * 1024;   // bytes of encoded text accepted in a POST
const MAX_JSON = 32 * 1024 * 1024;     // bytes the scene may inflate to
const ID_LENGTH = 10;

function reply(int $status, string $body = '', string $type = 'application/json'): never {
  http_response_code($status);
  header("Content-Type: $type; charset=utf-8");
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
function pathOf(string $data, string $id): string {
  return "$data/" . substr($id, 0, 2) . "/$id.txt";
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if ($method === 'OPTIONS') {
  // The editor posts text/plain (no preflight); answer one anyway for other clients.
  if (in_array($origin, $ORIGINS, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Methods: GET, POST');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Vary: Origin');
  }
  reply(204, '', 'text/plain');
}

if ($method === 'POST' && $path === '/') {
  if (!in_array($origin, $ORIGINS, true)) fail(403, 'Origin not allowed');
  header("Access-Control-Allow-Origin: $origin");
  header('Vary: Origin');
  $encoded = trim((string) file_get_contents('php://input', false, null, 0, MAX_ENCODED + 1));
  if ($encoded === '' || strlen($encoded) > MAX_ENCODED) fail(413, 'Scene too large');
  if (!preg_match('/^[A-Za-z0-9_-]+$/', $encoded)) fail(400, 'Not an encoded scene');
  $bytes = base64_decode(strtr($encoded, '-_', '+/'), true);
  $json = $bytes === false ? false : @gzinflate($bytes, MAX_JSON);
  $state = $json === false ? null : json_decode($json, true, 512);
  $scene = is_array($state) ? ($state['scene'] ?? null) : null;
  if (!is_array($scene) || ($scene['version'] ?? null) !== 1 || !is_array($scene['objects'] ?? null)) {
    fail(422, 'Not a svertik scene');
  }
  $id = idOf($encoded);
  $file = pathOf($DATA, $id);
  if (is_file($file)) {
    // Same id, other scene (a hash collision): refuse rather than hand out someone else's scene.
    if (file_get_contents($file) !== $encoded) fail(409, 'Link collision, change the scene slightly');
  } else {
    if (!is_dir(dirname($file)) && !mkdir(dirname($file), 0750, true) && !is_dir(dirname($file))) fail(500, 'Storage unavailable');
    // Write next to it and rename: a reader never sees half a scene.
    $tmp = $file . '.' . bin2hex(random_bytes(6)) . '.tmp';
    if (file_put_contents($tmp, $encoded) === false || !rename($tmp, $file)) {
      @unlink($tmp);
      fail(500, 'Storage unavailable');
    }
  }
  $scheme = (($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') ? 'https' : 'http';
  $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
  reply(201, json_encode(['id' => $id, 'url' => "$scheme://$host/$id"], JSON_UNESCAPED_SLASHES));
}

if ($method === 'GET' || $method === 'HEAD') {
  if ($path === '/') {
    header("Location: " . preg_replace('~/play\.html$~', '/', $PLAY), true, 302);
    exit;
  }
  if (preg_match('~^/([A-Za-z0-9]{' . ID_LENGTH . '})(\.txt)?$~', $path, $m)) {
    $file = pathOf($DATA, $m[1]);
    if (!is_file($file)) fail(404, 'No scene with this link');
    if (!empty($m[2])) {
      // A scene never changes under its id: cache it for good. Public, so any page may read it.
      header('Access-Control-Allow-Origin: *');
      header('Cache-Control: public, max-age=31536000, immutable');
      reply(200, (string) file_get_contents($file), 'text/plain');
    }
    header("Location: $PLAY#l=" . $m[1], true, 302);
    header('Cache-Control: public, max-age=86400');
    exit;
  }
  fail(404, 'Not found');
}

fail(405, 'Method not allowed');
