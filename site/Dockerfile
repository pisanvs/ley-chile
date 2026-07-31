FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time by
# `next build`, not read at runtime — but this stage otherwise has no
# visibility into Railway's service variables, so without this bridge every
# NEXT_PUBLIC_* reference in client code compiles to a live (and, in the
# browser, always-undefined) `process.env.X` lookup instead of a literal
# value. Confirmed live: PostHog and Sentry were both silently no-op'd this
# way (PostHogProvider/instrumentation-client.ts both gate on `if (!KEY)`).
# Railway auto-populates any ARG whose name matches a configured service
# variable — the ARG/ENV pair here is what makes that value visible to
# `next build` inside this stage.
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT

RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
