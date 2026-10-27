FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/dist ./apps/web/dist
RUN pnpm install --prod --frozen-lockfile --filter @ec/server...
ENV NODE_ENV=production PORT=2567
EXPOSE 2567
CMD ["node", "apps/server/dist/index.js"]
