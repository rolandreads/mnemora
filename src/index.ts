import { runBirthdayCheck } from './services/birthday.js';
import { logger } from './utils/logger.util.js';
import { setCorrelationId } from './utils/runtime.util.js';

async function main(): Promise<void> {
  const correlationId = `mnemora-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  setCorrelationId(correlationId);

  logger.info('Birthday check started', { correlationId });

  try {
    await runBirthdayCheck(logger);
    logger.info('Birthday check completed successfully', { correlationId });
    process.exit(0);
  } catch (error) {
    logger.error('Birthday check failed', error, { correlationId });
    process.exit(1);
  }
}

main();
