import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServer } from '../mcp-server.js';

// Define a basic handler type for our tests
interface ToolHandler {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any) => Promise<any>;
}

// Mock the ERegulationsApi
vi.mock('../services/eregulations-api.js', () => ({
  ERegulationsApi: vi.fn().mockImplementation(() => ({
    getProceduresList: vi.fn().mockResolvedValue([]),
    getProcedureById: vi.fn().mockResolvedValue({}),
    getProcedureResume: vi.fn().mockResolvedValue({}),
    getProcedureStep: vi.fn().mockResolvedValue({}),
  }))
}));

// Mock the Server from MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    close: vi.fn(),
    setRequestHandler: vi.fn(),
    request: vi.fn(),
    notification: vi.fn()
  }))
}));

describe('MCP Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe('createServer', () => {
    it('should create server with correct configuration', () => {
      const baseUrl = process.env.EREGULATIONS_API_URL;
      if (!baseUrl) {
        process.exit(1);
      }
      const { server } = createServer(baseUrl);
      expect(server).toBeDefined();
    });
  });
  
  describe('tools', () => {
    it('should define the listProcedures tool', () => {
      const baseUrl = process.env.EREGULATIONS_API_URL;
      if (!baseUrl) {
        process.exit(1);
      }
      const { handlers } = createServer(baseUrl);
      const listProceduresHandler = handlers.find((h: ToolHandler) => h.name === 'listProcedures');
      expect(listProceduresHandler).toBeDefined();
      expect(listProceduresHandler?.description).toContain('List all available procedures');
    });

    it('should define the getProcedureDetails tool', () => {
      const baseUrl = process.env.EREGULATIONS_API_URL;
      if (!baseUrl) {
        process.exit(1);
      }
      const { handlers } = createServer(baseUrl);
      const getProcedureDetailsHandler = handlers.find((h: ToolHandler) => h.name === 'getProcedureDetails');
      expect(getProcedureDetailsHandler).toBeDefined();
      expect(getProcedureDetailsHandler?.description).toContain('Get detailed information');
    });

  });
});