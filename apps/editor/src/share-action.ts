// Share, wherever it is offered (Play's button, the svertik menu, Export): make the link that opens this scene
// (in Play from Play, in the editor from the editor) and hand it over. On touch screens, the system share
// sheet; elsewhere, the clipboard.
import type { Editor } from './editor.svelte';
import type { ShareTarget } from './share';

/** How each place shows its notices: `ms` 0 keeps one until the next; `clear` hides it. */
export interface Notices {
  say: (text: string, ms?: number) => void;
  clear: () => void;
}

export const TOO_BIG = 'Too big for a link: save the project (.json) and send the file';
let sharing = false;

/** `target`: where the link opens. Play shares a link to Play; the editor's menus, a link to the editor. */
export async function shareScene(editor: Editor, { say, clear }: Notices, target: ShareTarget): Promise<void> {
  if (sharing || !editor.scene) return;
  sharing = true;
  say('Creating link…', 0);
  // Making the link may go to the link service: start it now, inside the click.
  const pending = editor.shareURL(target);
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      const url = await pending;
      if (!url) return say(TOO_BIG);
      try {
        await navigator.share({ title: editor.name, url });
        return clear();
      } catch (error) {
        // Cancelled: nothing to do. Otherwise (the click's permission ran out while the link was made) copy it.
        if ((error as DOMException)?.name === 'AbortError') return clear();
      }
    }
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        // A promised clipboard item keeps the click's permission while the link is made (Safari needs it).
        const blob = pending.then((url) => {
          if (!url) throw new Error(TOO_BIG);
          return new Blob([url], { type: 'text/plain' });
        });
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      } else {
        const url = await pending;
        if (!url) return say(TOO_BIG);
        await navigator.clipboard.writeText(url);
      }
      say(target === 'edit' ? 'Link copied: it opens this scene in the editor' : 'Link copied: it opens this scene in Play');
    } catch {
      say((await pending.catch(() => null)) ? 'Could not copy the link' : TOO_BIG);
    }
  } finally {
    sharing = false;
  }
}
