import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/rajdhani/400.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import './style.css';
import { Game } from './game/Game';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root element');

document.querySelector('#boot-splash')?.remove();

try {
  const game = new Game(app);
  (window as unknown as { __OUTPOST_GAME__?: Game }).__OUTPOST_GAME__ = game;
} catch (error) {
  console.error(error);
  const message =
    error instanceof Error ? error.message : 'The suit link could not be established.';
  app.innerHTML = `
    <div style="position:fixed;inset:0;display:grid;place-items:center;background:#040a0d;color:#e6f6f2;font-family:monospace;padding:2rem;">
      <div style="max-width:36rem;border:1px solid rgba(255,112,93,.4);padding:2rem;background:rgba(40,10,8,.3)">
        <p style="color:#ffb35c;letter-spacing:.24em;font-size:.65rem;margin:0 0 1rem">OUTPOST ZERO // LINK FAILURE</p>
        <h1 style="font-size:1.6rem;line-height:1.2;margin:0 0 1rem;font-family:sans-serif">This browser could not start the 3D client.</h1>
        <p style="color:#8ba6a8;line-height:1.5;font-family:sans-serif">WebGL2 is required. Try a current desktop browser with hardware acceleration enabled.</p>
        <p style="color:#536e6e;font-size:.75rem;word-break:break-word">${String(message).replace(/[<>&]/g, '')}</p>
      </div>
    </div>`;
}
