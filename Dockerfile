FROM node:18-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ ./
RUN mkdir -p data

FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/rebate.db

COPY --from=backend-build /app/backend ./backend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/data

EXPOSE 3001

WORKDIR /app/backend

CMD ["node", "src/index.js"]
