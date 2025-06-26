import { Client } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { log } from './index.js';

export class CommandExecutor {
  private sessions: Map<string, {
    client: Client | null;
    connection: Promise<void> | null;
    timeout: NodeJS.Timeout | null;
    host?: string;
    env?: Record<string, string>;
    shell?: any; 
    shellReady?: boolean;
  }> = new Map();
  
  private sessionTimeout: number = 20 * 60 * 1000; // 20 minutes

  constructor() {}

  private getSessionKey(host: string | undefined, sessionName: string): string {
    return `${host || 'local'}-${sessionName}`;
  }

  async connect(host: string, username: string, sessionName: string = 'default'): Promise<void> {
    const sessionKey = this.getSessionKey(host, sessionName);
    const session = this.sessions.get(sessionKey);
    
    if (session?.connection && session?.client) {
      if (session.client.listenerCount('ready') > 0 || session.client.listenerCount('data') > 0) {
        log.info(`Reusing existing session: ${sessionKey}`);
        return session.connection;
      }
      log.info(`Session ${sessionKey} disconnected, creating new session`);
      this.sessions.delete(sessionKey);
    }

    try {
      const privateKey = fs.readFileSync(path.join(os.homedir(), '.ssh', 'id_rsa'));

      const client = new Client();
      const connection = new Promise<void>((resolve, reject) => {
        client
          .on('ready', () => {
            log.info(`Session ${sessionKey} connected`);
            this.resetTimeout(sessionKey);
            
            client.shell((err, stream) => {
              if (err) {
                log.error(`Failed to create interactive shell: ${err.message}`);
                reject(err);
                return;
              }
              
              log.info(`Creating interactive shell for session ${sessionKey}`);
              
              const sessionData = this.sessions.get(sessionKey);
              if (sessionData) {
                sessionData.shell = stream;
                sessionData.shellReady = true;
                
                this.sessions.set(sessionKey, sessionData);
              }
              
              stream.on('close', () => {
                log.info(`Interactive shell for session ${sessionKey} closed`);
                const sessionData = this.sessions.get(sessionKey);
                if (sessionData) {
                  sessionData.shellReady = false;
                  this.sessions.set(sessionKey, sessionData);
                }
              });
              
              stream.write('echo "Shell ready"\n');
              
              resolve();
            });
          })
          .on('error', (err) => {
            log.error(`sessionKey ${sessionKey} err:`, err.message);
            reject(err);
          })
          .connect({
            host: host,
            username: username,
            privateKey: privateKey,
            keepaliveInterval: 60000,
          });
      });

      log.info(`Creating new session: ${sessionKey}`);
      this.sessions.set(sessionKey, {
        client,
        connection,
        timeout: null,
        host,
        shell: null,
        shellReady: false
      });

      return connection;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        throw new Error('SSH key file does not exist, please ensure SSH key-based authentication is set up');
      }
      throw error;
    }
  }

  private resetTimeout(sessionKey: string): void {
    const session = this.sessions.get(sessionKey);
    if (!session) return;

    if (session.timeout) {
      clearTimeout(session.timeout);
    }

    session.timeout = setTimeout(async () => {
      log.info(`Session ${sessionKey} timeout, disconnecting`);
      await this.disconnectSession(sessionKey);
    }, this.sessionTimeout);

    this.sessions.set(sessionKey, session);
  }

  async executeCommand(
    command: string,
    options: {
      host?: string;
      username?: string;
      session?: string;
      env?: Record<string, string>;
    } = {}
  ): Promise<{stdout: string; stderr: string}> {
    const { host, username, session = 'default', env = {} } = options;
    const sessionKey = this.getSessionKey(host, session);

    // 如果指定了host，则使用SSH执行命令
    if (host) {
      if (!username) {
        throw new Error('Username is required when using SSH');
      }
      
      let sessionData = this.sessions.get(sessionKey);
      
      let needNewConnection = false;
      if (!sessionData || sessionData.host !== host) {
        needNewConnection = true;
      } else if (sessionData.client) {
        if (sessionData.client.listenerCount('ready') === 0 && sessionData.client.listenerCount('data') === 0) {
          log.info(`Session ${sessionKey} disconnected, reconnecting`);
          needNewConnection = true;
        }
      } else {
        needNewConnection = true;
      }
      
      if (needNewConnection) {
        log.info(`Creating new connection for command execution: ${sessionKey}`);
        await this.connect(host, username, session);
        sessionData = this.sessions.get(sessionKey);
      } else {
        log.info(`Reusing existing session for command execution: ${sessionKey}`);
      }
      
      if (!sessionData || !sessionData.client) {
        throw new Error(`host ${host} err`);
      }
      
      this.resetTimeout(sessionKey);

      if (sessionData.shellReady && sessionData.shell) {
        log.info(`Executing command using interactive shell: ${command}`);
        return new Promise((resolve, reject) => {
          let stdout = "";
          let stderr = "";
          let commandFinished = false;
          const uniqueMarker = `CMD_END_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
          
          const envSetup = Object.entries(env)
            .map(([key, value]) => `export ${key}="${String(value).replace(/"/g, '\\"')}"`)
            .join(' && ');
          
          const fullCommand = envSetup ? `${envSetup} && ${command}` : command;
          
          const dataHandler = (data: Buffer) => {
            const str = data.toString();
            log.debug(`Shell数据: ${str}`);
            
            if (str.includes(uniqueMarker)) {
              commandFinished = true;
              
              const lines = stdout.split('\n');
              let commandOutput = '';
              let foundCommand = false;
              
              for (const line of lines) {
                if (foundCommand) {
                  if (line.includes(uniqueMarker)) {
                    break;
                  }
                  commandOutput += line + '\n';
                } else if (line.includes(fullCommand)) {
                  foundCommand = true;
                }
              }
              
              resolve({ stdout: commandOutput.trim(), stderr });
              
              sessionData.shell.removeListener('data', dataHandler);
              clearTimeout(timeout);
            } else if (!commandFinished) {
              stdout += str;
            }
          };
          
          const errorHandler = (err: Error) => {
            stderr += err.message;
            reject(err);
            sessionData.shell.removeListener('data', dataHandler);
            sessionData.shell.removeListener('error', errorHandler);
          };
          
          sessionData.shell.on('data', dataHandler);
          sessionData.shell.on('error', errorHandler);
          
          sessionData.shell.write(`echo "Starting command execution: ${fullCommand}"\n`);
          sessionData.shell.write(`${fullCommand}\n`);
          sessionData.shell.write(`echo "${uniqueMarker}"\n`);
          
          const timeout = setTimeout(() => {
            if (!commandFinished) {
              stderr += "Command execution timed out";
              resolve({ stdout, stderr });
              sessionData.shell.removeListener('data', dataHandler);
              sessionData.shell.removeListener('error', errorHandler);
            }
          }, 30000); // 30 seconds
        });
      } else {
        log.info(`Executing command using exec: ${command}`);
        return new Promise((resolve, reject) => {
          const envSetup = Object.entries(env)
            .map(([key, value]) => `export ${key}="${String(value).replace(/"/g, '\\"')}"`)
            .join(' && ');
          
          const fullCommand = envSetup ? `${envSetup} && ${command}` : command;
          
          sessionData?.client?.exec(`/bin/bash --login -c "${fullCommand.replace(/"/g, '\\"')}"`, (err, stream) => {
            if (err) {
              reject(err);
              return;
            }

            let stdout = "";
            let stderr = '';

            stream
              .on("data", (data: Buffer) => {
                this.resetTimeout(sessionKey);
                stdout += data.toString();
              })
              .stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
              })
              .on('close', () => {
                resolve({ stdout, stderr });
              })
              .on('error', (err) => {
                reject(err);
              });
          });
        });
      }
    } 
    else {
      log.info(`Executing command using local session: ${sessionKey}`);
      
      let sessionData = this.sessions.get(sessionKey);
      let sessionEnv = {};
      
      if (!sessionData) {
        sessionData = {
          client: null,
          connection: null,
          timeout: null,
          host: undefined,
          env: { ...env } 
        };
        this.sessions.set(sessionKey, sessionData);
        log.info(`Creating new local session: ${sessionKey}`);
        sessionEnv = env;
      } else {
        log.info(`Reusing existing local session: ${sessionKey}`);
        if (!sessionData.env) {
          sessionData.env = {};
        }
        sessionData.env = { ...sessionData.env, ...env };
        sessionEnv = sessionData.env;
        this.sessions.set(sessionKey, sessionData);
      }
      
      this.resetTimeout(sessionKey);
      
      return new Promise((resolve, reject) => {
        const envVars = { ...process.env, ...sessionEnv };
        
        log.info(`Executing local command: ${command}`);
        exec(command, { env: envVars }, (error, stdout, stderr) => {
          if (error && error.code !== 0) {
            resolve({ stdout, stderr: stderr || error.message });
          } else {
            resolve({ stdout, stderr });
          }
        });
      });
    }
  }

  private async disconnectSession(sessionKey: string): Promise<void> {
    const session = this.sessions.get(sessionKey);
    if (session) {
      if (session.shell) {
        log.info(`Closing interactive shell for session ${sessionKey}`);
        session.shell.end();
        session.shellReady = false;
      }
      if (session.client) {
        log.info(`Disconnecting SSH connection for session ${sessionKey}`);
        session.client.end();
      }
      if (session.timeout) {
        clearTimeout(session.timeout);
      }
      log.info(`Disconnecting session: ${sessionKey}`);
      this.sessions.delete(sessionKey);
    }
  }

  async disconnect(): Promise<void> {
    const disconnectPromises = Array.from(this.sessions.keys()).map(
      sessionKey => this.disconnectSession(sessionKey)
    );
    
    await Promise.all(disconnectPromises);
    this.sessions.clear();
  }
}