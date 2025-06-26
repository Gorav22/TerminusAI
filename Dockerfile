FROM node:lts-alpine

# Create app directory
WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json and package-lock.json are copied
COPY package*.json ./

# Install dependencies (skip prepare script to avoid build issues, we'll explicitly run build step)
RUN npm install --ignore-scripts

# Copy app source code
COPY . .

# Build the application
RUN npm run build

# Expose port 8080 for SSE mode (if used)
EXPOSE 8080

# Command to run the application
CMD ["node", "build/index.js"]
