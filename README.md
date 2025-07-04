# TerminusAI – a final stop for all terminal tasks, AI-driven


Terminal MCP Server is a Model Context Protocol (MCP) server that allows executing commands on local or remote hosts. It provides a simple yet powerful interface for AI models and other applications to execute system commands, either on the local machine or on remote hosts via SSH.

## Features

- **Local Command Execution**: Execute commands directly on the local machine
- **Remote Command Execution**: Execute commands on remote hosts via SSH
- **Session Persistence**: Support for persistent sessions that reuse the same terminal environment for a specified time (default 20 minutes)
- **Environment Variables**: Set custom environment variables for commands
- **Multiple Connection Methods**: Connect via stdio or SSE (Server-Sent Events)

## Installation

### Installing via Smithery

To install TerminusAI-server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@Gorav22/TerminusAI):

```bash
npx -y @smithery/cli install @Gorav22/TerminusAI --client claude
```

### Manual Installation
```bash
# Clone the repository
git clone https://github.com/Gorav/TerminusAI.git
cd TerminusAI

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### Starting the Server

```bash
# Start the server using stdio (default mode)
npm start

# Or run the built file directly
node build/index.js
```

### Starting the Server in SSE Mode

The SSE (Server-Sent Events) mode allows you to connect to the server remotely via HTTP.

```bash
# Start the server in SSE mode
npm run start:sse

# Or run the built file directly with SSE flag
node build/index.js --sse
```

You can customize the SSE server with the following command-line options:

| Option | Description | Default |
|--------|-------------|---------|
| `--port` or `-p` | The port to listen on | 8080 |
| `--endpoint` or `-e` | The endpoint path | /sse |
| `--host` or `-h` | The host to bind to | localhost |

Example with custom options:

```bash
# Start SSE server on port 3000, endpoint /mcp, and bind to all interfaces
node build/index.js --sse --port 3000 --endpoint /mcp --host 0.0.0.0
```

This will start the server and listen for SSE connections at `http://0.0.0.0:3000/mcp`.

### Testing with MCP Inspector

```bash
# Start the MCP Inspector tool
npm run inspector
```

## The execute_command Tool

The execute_command tool is the core functionality provided by Terminal MCP Server, used to execute commands on local or remote hosts.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| command | string | Yes | The command to execute |
| host | string | No | The remote host to connect to. If not provided, the command will be executed locally |
| username | string | Required when host is specified | The username for SSH connection |
| session | string | No | Session name, defaults to "default". The same session name will reuse the same terminal environment for 20 minutes |
| env | object | No | Environment variables, defaults to an empty object |

### Examples

#### Executing a Command Locally

```json
{
  "command": "ls -la",
  "session": "my-local-session",
  "env": {
    "NODE_ENV": "development"
  }
}
```

#### Executing a Command on a Remote Host

```json
{
  "host": "example.com",
  "username": "user",
  "command": "ls -la",
  "session": "my-remote-session",
  "env": {
    "NODE_ENV": "production"//add any other env variables if your terminal code needs that like in linux if your command wants to use root or admin piower for which its password is needed then mention that in env and also tell to llm about that or it automatic scans and come to know that. 
  }
}
```

## Configuring with AI Assistants

#### For stdio mode (local connection)

```json
{
  "mcpServers": {
    "TerminusAI": {
      "command": "node",
      "args": ["/path/to/TerminusAI-server/build/index.js"],
      "env": {}//add env variables if your terminal code needs that like in linux if your command wants to use root or admin piower for which its password is needed then mention that in env and also tell to llm about that or it automatic scans and come to know that. 
    }
  }
}
```

#### For SSE mode (remote connection)

```json
{
  "mcpServers": {
    "TerminusAI-sse": {
      "url": "http://localhost:8080/sse",
      "headers": {}//add env variables if your terminal code needs that like in linux if your command wants to use root or admin piower for which its password is needed then mention that in env and also tell to llm about that or it automatic scans and come to know that. 
    }
  }
}
```

Replace `localhost:8080/sse` with your actual server address, port, and endpoint if you've customized them.

### Configuring with Cline

1. Open the Cline settings file: `~/.cline/config.json`
2. Add the following configuration:

#### For stdio mode (local connection)

```json
{
  "mcpServers": {
    "TerminusAI": {
      "command": "node",
      "args": ["/path/to/TerminusAI-server/build/index.js"],
      "env": {}//add env variables if your terminal code needs that like in linux if your command wants to use root or admin piower for which its password is needed then mention that in env and also tell to llm about that or it automatic scans and come to know that. 
    }
  }
}
```

#### For SSE mode (remote connection)

```json
{
  "mcpServers": {
    "TerminusAI-sse": {
      "url": "http://localhost:8080/sse",
      "headers": {}//add env variables if your terminal code needs that like in linux if your command wants to use root or admin piower for which its password is needed then mention that in env and also tell to llm about that or it automatic scans and come to know that. 
    }
  }
}
```

### Configuring with Claude Desktop

1. Open the Claude Desktop settings file: `C:\Users\HP\AppData\Roaming\Claude\claude_desktop_config.json`
2. Add the following configuration:

#### For stdio mode (local connection)

```json
{
  "mcpServers": {
    "TerminusAI": {
      "command": "node",
      "args": ["/path/to/TerminusAI-server/build/index.js"],
      "env": {} //add env variables if your terminal code needs that like in linux if your command wants to use root or admin piower for which its password is needed then mention that in env and also tell to llm about that or it automatic scans and come to know that. 
    }
  }
}
```

#### For SSE mode (remote connection)

```json
{
  "mcpServers": {
    "TerminusAI-sse": {
      "url": "http://localhost:8080/sse",
      "headers": {}
    }
  }
}
```

## Best Practices

### Command Execution

- Before running commands, it's best to determine the system type (Windows, Linux, etc.)
- Use full paths to avoid path-related issues
- For command sequences that need to maintain environment, use `&&` to connect multiple commands
- For long-running commands, consider using `nohup` or `screen`/`tmux`

### SSH Connection

- Ensure SSH key-based authentication is set up
- If connection fails, check if the key file exists (default path: `.ssh/id_rsa`)
- Make sure the SSH service is running on the remote host

### Session Management

- Use the session parameter to maintain environment between related commands
- For operations requiring specific environments, use the same session name
- Note that sessions will automatically close after 20 minutes of inactivity

### Error Handling

- Command execution results include both stdout and stderr
- Check stderr to determine if the command executed successfully
- For complex operations, add verification steps to ensure success

## Important Notes

- For remote command execution, SSH key-based authentication must be set up in advance
- For local command execution, commands will run in the context of the user who started the server
- Session timeout is 20 minutes, after which the connection will be automatically closed
