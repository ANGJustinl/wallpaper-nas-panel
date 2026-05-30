import { activateDownloadWorker, createAppContext, seedApplicationData } from './bootstrap';

const context = createAppContext();
seedApplicationData(context);
activateDownloadWorker(context);

function shutdown(signal: string) {
  context.downloadQueue.stopWorkerLoop(`worker stopped by ${signal}`);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log(`download worker active: ${context.downloadQueue.getRunnerId()}`);
