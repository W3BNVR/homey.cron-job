# Crontab Schedule

Effortlessly schedule Flows with cron expressions for seamless control. Simplify your Flows and make your home smarter.

You can use any expressions which are supported by (the npm package) cron. For example '0 */5 * 6-8 1-5' will run your Flow every 5 minutes during weekdays in the summer months.

## Cron explanation in Flows

Use the **Schedule with explanation** trigger. As you type a cron expression in the Flow card, Homey's autocomplete suggestion shows what it means and the next scheduled run. The trigger accepts the same five-field and six-field formats as the `cron` package used to run schedules.

For example, `*/5 0-5 * 11,12,1,2 1-5` means every five minutes between 00:00 and 05:59 on weekdays, in November, December, January, and February.
