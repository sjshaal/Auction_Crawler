import cron from 'node-cron';
import { runCrawl } from '../crawlers/index.js';
import { saveListings, getSearchConfigs, markLastRunAt } from '../db/Database.js';

interface Job {
  task:       cron.ScheduledTask;
  configId:   number;
  configName: string;
  interval:   string;
}

const jobs = new Map<number, Job>();

export function startScheduler(): void {
  console.log('[scheduler] Starting — loading saved search configs...');
  const configs = getSearchConfigs();

  for (const config of configs) {
    if (config.enabled && config.scheduleInterval && config.id) {
      scheduleJob(config.id, config.name, config.scheduleInterval);
    }
  }

  console.log(`[scheduler] ${jobs.size} job(s) scheduled.`);
}

export function scheduleJob(configId: number, configName: string, interval: string): void {
  if (jobs.has(configId)) {
    jobs.get(configId)!.task.stop();
  }

  if (!cron.validate(interval)) {
    console.error(`[scheduler] Invalid cron expression for "${configName}": ${interval}`);
    return;
  }

  const task = cron.schedule(interval, async () => {
    console.log(`[scheduler] Running job for "${configName}" (id=${configId})`);
    const configs = getSearchConfigs();
    const config  = configs.find(c => c.id === configId);
    if (!config || !config.enabled) return;

    const result = await runCrawl(config);
    saveListings(result.listings);
    markLastRunAt(configId);
    console.log(`[scheduler] Job "${configName}" saved ${result.listings.length} listings.`);
  });

  jobs.set(configId, { task, configId, configName, interval });
  console.log(`[scheduler] Scheduled "${configName}" at: ${interval}`);
}

export function unscheduleJob(configId: number): void {
  const job = jobs.get(configId);
  if (job) {
    job.task.stop();
    jobs.delete(configId);
    console.log(`[scheduler] Removed job for config id=${configId}`);
  }
}

export function getSchedulerStatus(): {
  totalJobs: number;
  jobs: Array<{ configId: number; configName: string; interval: string }>;
} {
  return {
    totalJobs: jobs.size,
    jobs: Array.from(jobs.values()).map(j => ({
      configId:   j.configId,
      configName: j.configName,
      interval:   j.interval,
    })),
  };
}
