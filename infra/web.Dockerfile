FROM node:22-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web
RUN npm run build:web

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace/package.json /workspace/package.json
COPY --from=build /workspace/apps/web/package.json /workspace/apps/web/package.json
COPY --from=build /workspace/apps/web/next.config.ts /workspace/apps/web/next.config.ts
COPY --from=build /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/apps/web/.next /workspace/apps/web/.next
COPY --from=build /workspace/apps/web/public /workspace/apps/web/public
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@wok/web"]
