# svertik link

The link shortener behind the editor's **Share** button: it stores a scene and gives it a short link, such
as `https://link.svertik.com/3fK9aQ2xLm`, that opens it in the Play page.

One PHP file (`index.php`), no dependencies and no database: each scene is a text file named after a hash
of its content, so the same scene always gets the same link and stored scenes never change.

## API

| Request | Answer |
| --- | --- |
| `POST /`, body: the encoded scene, `text/plain` | `201 { "id", "url" }` |
| `GET /<id>` | `302` to the Play page, `play.html#l=<id>` |
| `GET /<id>.txt` | The encoded scene (public, cached for good) |

The encoded scene is the editor's link format: the state `{ scene, name, script?, canvas? }` as JSON,
compressed with deflate-raw and written in base64url (see `apps/editor/src/share.ts`). The server only
accepts it if it inflates into a scene (`version: 1` with `objects`), up to 4 MB encoded. Uploads are
accepted only from the origins listed in `SVERTIK_LINK_ORIGINS`.

Anyone with a link can open its scene. Links are permanent.

## Configuration

Environment variables, passed by nginx (`fastcgi_param`):

| Variable | Default | |
| --- | --- | --- |
| `SVERTIK_LINK_DATA` | `./data` | Folder where scenes are stored; writable by PHP-FPM, outside any public root |
| `SVERTIK_LINK_PLAY` | `https://editor.svertik.com/play.html` | Play page that short links open |
| `SVERTIK_LINK_ORIGINS` | `https://editor.svertik.com` | Comma-separated origins allowed to upload |

The editor uses the service when it is built with `VITE_SHARE_URL` set to its address (for example
`VITE_SHARE_URL=https://link.svertik.com`). Without it, Share puts the whole scene in the link, as before.

## Hosting

Needs nginx and PHP 8.1+ (FPM) with zlib and json.

1. Point the subdomain's DNS (`A`/`AAAA`) at the server.
2. Copy `index.php` to `/var/www/link.svertik.com/app/` and create `/var/www/link.svertik.com/data/`, owned
   by the PHP-FPM user (`www-data`).
3. Copy `nginx.conf` to `/etc/nginx/sites-available/link.svertik.com`, check its paths and PHP socket,
   link it into `sites-enabled`, then `nginx -t && systemctl reload nginx`.
4. HTTPS: `certbot --nginx -d link.svertik.com`.

Try it locally with `php -S localhost:8787 index.php` and an `Origin` header that is in the list.
