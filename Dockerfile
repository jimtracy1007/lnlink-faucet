FROM node:21.5.0

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy application files
COPY . .

# Create logs directory
RUN mkdir -p logs

EXPOSE 3000

CMD ["yarn", "start"]
