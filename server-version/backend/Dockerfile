FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy prisma schema
COPY prisma ./prisma/

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create uploads directory
RUN mkdir -p /app/uploads/videos /app/uploads/images /app/uploads/covers

EXPOSE 3000

# Start command with migration
CMD sh -c "npx prisma migrate deploy && npx prisma db seed || true && npm start"
