// Shared location for personal, non-committed data (base resume, drafts, knowledge).
// Defaults to <repo>/data; override with DATA_DIR (e.g. to mount a Docker volume elsewhere).
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
