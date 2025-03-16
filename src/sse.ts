import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { createServer } from "./mcp-server.js";
import { logger } from "./utils/logger.js";
import { v4 as uuidv4 } from "uuid";

// Default API URL
const API_URL = process.env.EREGULATIONS_API_URL || "https://api-tanzania.tradeportal.org";
const app = express();
const { server, cleanup } = createServer(API_URL);

// Map to store transports by session ID
const transports = new Map<string, SSEServerTransport>();

// Configure CORS headers for SSE connections
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// SSE endpoint
app.get("/sse", async (req, res) => {
  const sessionId = req.query.sessionId?.toString() || uuidv4();
  logger.info(`Received SSE connection for session: ${sessionId}`);
  
  try {
    // Create a new transport - this will set headers internally when start() is called
    const transport = new SSEServerTransport("/message", res);
    
    // Store the transport with the session ID
    transports.set(sessionId, transport);
    logger.info(`Created transport for session: ${sessionId}. Active sessions: ${transports.size}`);
    
    // Connect the server to this transport
    // This will call transport.start() internally, which sets the SSE headers
    await server.connect(transport);
    
    // Set up heartbeat AFTER headers have been set by the transport
    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch (err) {
        clearInterval(heartbeat);
        logger.warn(`Failed to send heartbeat to session ${sessionId}, connection may be closed`);
      }
    }, 30000);
    
    // Send the session ID to the client after transport is connected
    res.write(`data: ${JSON.stringify({ sessionId })}\n\n`);
    
    // Handle client disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      transports.delete(sessionId);
      logger.info(`Client disconnected: ${sessionId}. Remaining sessions: ${transports.size}`);
    });
    
    // Set up close handler
    server.onclose = async () => {
      logger.info(`Closing transport for session: ${sessionId}`);
      clearInterval(heartbeat);
      transports.delete(sessionId);
      await cleanup();
      await server.close();
      process.exit(0);
    };
    
  } catch (error) {
    transports.delete(sessionId);
    logger.error(`Error setting up SSE transport for session ${sessionId}:`, error);
    if (!res.headersSent) {
      res.status(500).end(`Error setting up SSE transport: ${error instanceof Error ? error.message : String(error)}`);
    } else {
      // Try to end the response with an error message if headers are already sent
      try {
        res.write(`data: ${JSON.stringify({ error: "Connection error", message: String(error) })}\n\n`);
        res.end();
      } catch (writeError) {
        logger.error(`Failed to write error to response:`, writeError);
      }
    }
  }
});

// Message endpoint for client to post messages to the server
app.post("/message", async (req, res) => {
  // Get session ID from query parameter or header
  const sessionId = req.query.sessionId?.toString() || req.headers['x-session-id']?.toString();
  
  if (!sessionId) {
    logger.warn("No session ID provided");
    return res.status(400).json({ error: "No session ID provided" });
  }
  
  logger.info(`Received message from client for session: ${sessionId}`);
  
  const transport = transports.get(sessionId);
  if (!transport) {
    logger.warn(`No transport found for session ${sessionId}`);
    return res.status(404).json({ error: "No active connection for this session" });
  }
  
  try {
    await transport.handlePostMessage(req, res);
    logger.info(`Successfully handled post message for session: ${sessionId}`);
  } catch (error) {
    logger.error(`Error handling post message for session ${sessionId}:`, error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Error handling message", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  const status = {
    status: "ok",
    activeSessions: transports.size,
    serverReady: !!server,
    uptime: process.uptime()
  };
  logger.info(`Health check: ${transports.size} active sessions`);
  res.status(200).json(status);
});

// Start the server
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
  logger.info(`eRegulations MCP server running on port ${PORT}`);
  logger.info(`Connect via SSE at http://localhost:${PORT}/sse`);
});