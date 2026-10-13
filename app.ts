'use strict';

/* eslint-disable @typescript-eslint/no-misused-promises */

import Homey from 'homey';
import { CronJob } from 'cron';
import cronstrue from 'cronstrue/i18n';

type CronParts = {
  second?: string;
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

type CronPreview = {
  valid: true;
  explanation: string;
  nextRuns: string[];
  timezone: string;
} | {
  valid: false;
  error: string;
}

const expressionFromParts = (parts: CronParts): string => {
  return `${parts.second ? parts.second : ''} ${parts.minute} ${parts.hour} ${parts.dayOfMonth} ${parts.month} ${parts.dayOfWeek}`.trim();
};

class CronJobApp extends Homey.App {

  cronExpressionSchedule?: Homey.FlowCardTrigger;
  cronExpressionSchedulePreview?: Homey.FlowCardTrigger;
  cronPartsSchedule?: Homey.FlowCardTrigger;
  jobs: Record<string, CronJob> = { };

  /** Validate an expression with the same cron library used by the scheduler. */
  previewCron(expression: unknown): CronPreview {
    if (typeof expression !== 'string' || expression.trim() === '') {
      return { valid: false, error: 'Vul een cron-expressie in.' };
    }

    try {
      const schedule = expression.trim();
      const job = CronJob.from({
        cronTime: schedule,
        onTick: () => undefined,
        start: false,
        timeZone: this.homey.clock.getTimezone(),
      });
      let explanation: string;
      try {
        explanation = cronstrue.toString(schedule, {
          locale: 'nl',
          use24HourTimeFormat: true,
        });
      } catch (error) {
        this.log(`Cron description is unavailable for ${schedule}: ${String(error)}`);
        // Keep every expression accepted by `cron` usable, even if the
        // human-readable parser does not know one of cron's advanced tokens.
        explanation = `Geldige cron-expressie: ${schedule}. Bekijk de eerstvolgende uitvoeringen hieronder.`;
      }
      const timezone = this.homey.clock.getTimezone();
      const formatter = new Intl.DateTimeFormat('nl-NL', {
        timeZone: timezone,
        dateStyle: 'full',
        timeStyle: 'short',
      });
      const nextRuns = job.nextDates(5).map((date) => formatter.format(date.toJSDate()));

      return {
        valid: true,
        explanation,
        nextRuns,
        timezone,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.cronExpressionSchedule = this.homey.flow.getTriggerCard('cron_expression_schedule');
    this.cronExpressionSchedulePreview = this.homey.flow.getTriggerCard('cron_expression_schedule_preview');
    this.cronPartsSchedule = this.homey.flow.getTriggerCard('cron_parts_schedule');

    this.cronExpressionSchedule.registerRunListener(async (args, state) => {
      return args.schedule === state.schedule;
    });

    this.cronExpressionSchedulePreview.registerArgumentAutocompleteListener('schedule', async (query) => {
      const expression = query.trim() || '* * * * * *';

      const preview = this.previewCron(expression);
      const description = preview.valid
        ? `${preview.explanation}. Eerstvolgende: ${preview.nextRuns[0] ?? 'onbekend'}`
        : `Nog geen geldige cron-expressie: ${preview.error}`;

      return [{
        id: expression,
        name: expression,
        description,
      }];
    });

    this.cronExpressionSchedulePreview.registerRunListener(async (args, state) => {
      return this.getScheduleValue(args.schedule) === state.schedule;
    });

    this.cronPartsSchedule.registerRunListener(async (args, state) => {
      return expressionFromParts(args) === state.schedule;
    });

    await this.handleUpdate();

    this.cronExpressionSchedule.on('update', this.handleUpdate.bind(this));
    this.cronExpressionSchedulePreview.on('update', this.handleUpdate.bind(this));
    this.cronPartsSchedule.on('update', this.handleUpdate.bind(this));

    this.homey.clock.on('timezoneChange', async () => {
      Object.keys(this.jobs)
        .forEach((key) => {
          this.jobs[key].stop();
          delete this.jobs[key];
          this.log(`Stopped schedule ${key}`);
        });

      await this.handleUpdate();
    });
  }

  async handleUpdate() {
    const previewSchedules = (await this.cronExpressionSchedulePreview?.getArgumentValues() ?? [])
      .map((card) => this.getScheduleValue(card.schedule));

    // use set to only handle unique schedules
    const schedules = [...new Set([
      ...(await this.cronExpressionSchedule?.getArgumentValues() ?? []).map((c) => c.schedule),
      ...previewSchedules,
      ...(await this.cronPartsSchedule?.getArgumentValues() ?? []).map(expressionFromParts),
    ])].filter(Boolean);

    Object.keys(this.jobs)
      .forEach((key) => {
        // stop and remove all jobs which are not used in flows anymore
        if (!schedules.includes(key)) {
          this.jobs[key].stop();
          delete this.jobs[key];
          this.log(`Stopped schedule ${key}`);
        }
      });

    schedules.forEach((schedule) => {
      // ignore already scheduled jobs
      if (this.jobs[schedule]) {
        return;
      }

      try {
        this.jobs[schedule] = CronJob.from({
          cronTime: schedule,
          onTick: async () => {
            this.log(`Triggered schedule ${schedule}`);
            // trigger both, this will be filtered by the RunListener
            await this.cronExpressionSchedule?.trigger(undefined, { schedule });
            await this.cronExpressionSchedulePreview?.trigger(undefined, { schedule });
            await this.cronPartsSchedule?.trigger(undefined, { schedule });
          },
          start: true,
          timeZone: this.homey.clock.getTimezone(),
        });

        this.log(`Started schedule ${schedule}`);
      } catch (e) {
        this.error(e, schedule);
      }
    });
  }

  getScheduleValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
      return value.id;
    }
    return '';
  }

}

module.exports = CronJobApp;
