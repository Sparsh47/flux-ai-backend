import * as Sentry from "@sentry/node";
import { env } from "../schema/env.js";

Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    sendDefaultPii: true,
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
    integrations: [
        Sentry.httpIntegration(),
        Sentry.expressIntegration(),
        Sentry.prismaIntegration(),
    ]
});

export default Sentry;