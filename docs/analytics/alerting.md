# Analytics Alerting Engine

The analytics alerting engine connects forecasting output with configurable notification rules so operations teams can react quickly to changes in demand. It consists of three layers:

1. **Forecasting service** – generates rolling projections by combining warehouse history with weather and seasonal inputs. Forecast output is persisted in `analytics_forecasts` and exposed to workspaces and alert rules.
2. **Alerting engine** – evaluates threshold rules, respects schedules, and dispatches alerts across email, SMS, and Slack. User preferences (email, phone, quiet hours) are stored per profile and surfaced through the Alert Configurator.
3. **Workspace UI** – the analytics workspace page provides a dynamic dashboard builder with cohort filters, saved views, and drill-through details that consume the forecast data.

## Configuring Alerts

Routes under `/api/alerts` manage rule configuration and preferences:

- `GET /api/alerts/preferences` – fetch the current user's channel settings, including quiet hours.
- `PUT /api/alerts/preferences` – update delivery channels, contact details, or quiet hours.
- `GET /api/alerts/rules` – list alert rules (admin only).
- `POST /api/alerts/rules` – create a rule with thresholds, schedules, channels, and subscribers.
- `PUT /api/alerts/rules/:id` – update rule settings.
- `POST /api/alerts/run` – trigger an immediate evaluation (admin only).

Each rule defines:

- **Metric** – `revenue`, `orders`, or `average_order_value` with optional cohort filters.
- **Comparison** – `above`, `below`, `equal`, or `outside_bounds` to compare against a threshold or forecast band.
- **Schedule** – hourly, daily, or weekly recurrence (with optional time/weekday controls).
- **Channels** – direct recipients (email/SMS/Slack webhooks) plus subscribers who inherit their own preferences.

## Notification Preferences UI

The `AlertConfigurator` component lets users toggle channels, register contact information, and set quiet hours. Preferences are saved via the `/api/alerts/preferences` endpoint and respected by the alerting engine before dispatching notifications.

## Forecast Accuracy

Automated tests cover forecast accuracy and alert delivery:

- **Forecast accuracy** – validates moving average trend forecasts stay within a 5% MAPE window using deterministic test data.
- **Scheduling & delivery** – ensures alerts respect quiet hours and deliver to email, SMS, and Slack when thresholds are breached.

To run the test suite:

```bash
npm test
```

This executes both client (Vitest) and server (Node test runner) suites, including the new forecasting and alerting tests.
