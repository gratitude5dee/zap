/**
 * Scheduler worker replacing the Vercel cron (every two minutes) that GETs
 * /api/cron/provider-poll with a CRON_SECRET bearer.
 */
const TARGET_URL = "https://zap.wzrd.tech/api/cron/provider-poll";

export default {
  async scheduled(event, env, ctx) {
    const headers = {};
    if (env.CRON_SECRET) {
      headers.authorization = `Bearer ${env.CRON_SECRET}`;
    }
    const response = await fetch(TARGET_URL, { headers });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `provider-poll cron failed: ${response.status} ${body.slice(0, 500)}`,
      );
    }
    console.log(`provider-poll drained: ${response.status} ${body.slice(0, 300)}`);
  },
};
