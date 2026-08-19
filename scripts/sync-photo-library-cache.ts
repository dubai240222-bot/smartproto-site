/**
 * Pre-download photo library templates to /media/library/ for reliable hero assignment.
 * Run once after deploy or when expanding the library.
 */
import 'dotenv/config';
import { librarySize, syncPhotoLibraryCache } from '../src/lib/photo-library';

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
  console.log(`Syncing photo library cache (${limit ?? librarySize()} assets)…`);
  const { ok, fail } = await syncPhotoLibraryCache({ limit });
  console.log(`Done: ok=${ok} fail=${fail}`);
  if (fail > 0) process.exitCode = fail > ok ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
