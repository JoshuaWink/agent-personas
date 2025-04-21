import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { Persona } from '../src/types'; // Use types for validation
import { 
  PARSE_ERROR, 
  INVALID_REQUEST, 
  METHOD_NOT_FOUND, 
  INVALID_PARAMS, 
  INTERNAL_ERROR 
} from '../src/rpc-constants'; // Import shared constants

// Path to the compiled server script
const serverScriptPath = path.resolve(__dirname, '../dist/server.js');

// Define a type for the result of running the script
interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  response?: any; // Parsed JSON response from stdout
}

// Helper function to run the server script with given JSON input
async function runServer(jsonRpcInput: object | string, env?: Record<string, string>): Promise<ScriptResult> {
  return new Promise((resolve, reject) => {
    const inputString = typeof jsonRpcInput === 'string' ? jsonRpcInput : JSON.stringify(jsonRpcInput);
    
    // Use process.env and merge optional env variables
    const processEnv = { ...process.env, ...env };

    const child = spawn('node', [serverScriptPath], { 
        stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
        env: processEnv 
    });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    child.stderr.on('data', (data) => {
      // Capture stderr for debugging, but don't treat as execution error unless exit code != 0
      stderrData += data.toString(); 
      // console.error('[Test stderr]:', data.toString()); // Optional: log stderr during tests
    });

    child.on('error', (error) => {
       // Errors like EACCES or ENOENT for the node process itself
      console.error('[Test process error]:', error);
      reject(new Error(`Failed to spawn server process: ${error.message}`));
    });

    child.on('close', (code) => {
        let parsedResponse: any;
        try {
            // Attempt to parse stdout as JSON
            parsedResponse = stdoutData ? JSON.parse(stdoutData) : undefined;
        } catch(e) {
            // If parsing fails, keep response undefined, rely on stdout string
        }
        resolve({ 
            stdout: stdoutData,
            stderr: stderrData,
            exitCode: code,
            response: parsedResponse
        });
    });

    // Write the input to stdin and close it to signal end-of-input
    child.stdin.write(inputString + '\n'); // Add newline like readline does
    child.stdin.end();
  });
}

// --- Test Suite --- 
describe('Server Script (server.ts via stdio)', () => {
  let tempDir: string;
  let testStoragePath: string;

  beforeEach(async () => {
    // Create a unique temporary directory and storage path for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'server-test-data-'));
    testStoragePath = path.join(tempDir, 'personas.json');
    // Ensure the directory exists for the driver
    await fs.mkdir(path.dirname(testStoragePath), { recursive: true });
  });

  afterEach(async () => {
    // Clean up the temporary directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(err => {
        console.warn(`Error cleaning up server test temp dir: ${err.message}`);
      });
    }
  });

  // Helper to read the storage file directly
  const readStorageFile = async (): Promise<any | null> => {
    try {
      const content = await fs.readFile(testStoragePath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') return { active: [], archived: [] }; // Default empty state
      throw error; 
    }
  };

  // --- Basic Success Tests --- 
  test('should handle persona.create request successfully', async () => {
    const requestId = 1;
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'persona.create',
      params: {
        name: 'Server Test Persona',
        description: 'Created via server script',
        instructions: 'Test server instructions',
        tags: ['server', 'test'],
        settings: { complexity: 5 }
      }
    };

    const result = await runServer(request, { PERSONA_STORAGE_PATH: testStoragePath });

    // Check process exit
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('error'); // Basic check for unexpected errors

    // Check JSON-RPC response
    expect(result.response).toBeDefined();
    expect(result.response.jsonrpc).toBe('2.0');
    expect(result.response.id).toBe(requestId);
    expect(result.response.error).toBeUndefined();
    expect(result.response.result).toBeDefined();
    expect(result.response.result.id).toBeDefined(); // Check if created persona with ID is returned
    expect(result.response.result.name).toBe(request.params.name);

    // Check persisted file content
    const storedData = await readStorageFile();
    expect(storedData).not.toBeNull();
    expect(Array.isArray(storedData!.active)).toBe(true);
    expect(Array.isArray(storedData!.archived)).toBe(true);
    expect(storedData!.active).toHaveLength(1);
    expect(storedData!.archived).toHaveLength(0);
    expect(storedData!.active[0].id).toBe(result.response.result.id);
    expect(storedData!.active[0].name).toBe(request.params.name);
  });

  test('should handle persona.list request successfully (only active)', async () => {
     // Create one active, one archived persona
    const createActive = { jsonrpc: '2.0', id: 'c1', method: 'persona.create', params: { name: 'ListActive', description: 'd', instructions: 'i', tags: [], settings: {} } };
    const createArchived = { jsonrpc: '2.0', id: 'c2', method: 'persona.create', params: { name: 'ListArchived', description: 'd', instructions: 'i', tags: [], settings: {} } };
    const activeRes = await runServer(createActive, { PERSONA_STORAGE_PATH: testStoragePath });
    const archivedRes = await runServer(createArchived, { PERSONA_STORAGE_PATH: testStoragePath });
    const activeId = activeRes.response.result.id;
    const archivedId = archivedRes.response.result.id;
    // Manually archive the second one by modifying the file (simpler than calling archive via server)
    let currentData = await readStorageFile();
    currentData.archived.push(currentData.active.pop()); // Move from active to archived
    await fs.writeFile(testStoragePath, JSON.stringify(currentData));

    // Now, list personas - should only get the active one
    const listRequestId = 'list1';
    const listRequest = { jsonrpc: '2.0', id: listRequestId, method: 'persona.list' }; 
    const listResult = await runServer(listRequest, { PERSONA_STORAGE_PATH: testStoragePath });

    expect(listResult.exitCode).toBe(0);
    expect(listResult.response?.id).toBe(listRequestId);
    expect(listResult.response?.error).toBeUndefined();
    expect(Array.isArray(listResult.response?.result)).toBe(true);
    expect(listResult.response?.result).toHaveLength(1); // Only active one
    expect(listResult.response?.result[0].id).toBe(activeId);
    expect(listResult.response?.result[0].name).toBe('ListActive');
  });

   test('should handle persona.get request successfully (only active)', async () => {
    // Create one active, one archived persona (as above)
     const createActive = { jsonrpc: '2.0', id: 'c1', method: 'persona.create', params: { name: 'GetActive', description: 'd', instructions: 'i', tags: [], settings: {} } };
     const createArchived = { jsonrpc: '2.0', id: 'c2', method: 'persona.create', params: { name: 'GetArchived', description: 'd', instructions: 'i', tags: [], settings: {} } };
     const activeRes = await runServer(createActive, { PERSONA_STORAGE_PATH: testStoragePath });
     const archivedRes = await runServer(createArchived, { PERSONA_STORAGE_PATH: testStoragePath });
     const activeId = activeRes.response.result.id;
     const archivedId = archivedRes.response.result.id;
     let currentData = await readStorageFile();
     currentData.archived.push(currentData.active.pop()); 
     await fs.writeFile(testStoragePath, JSON.stringify(currentData));

     // Get the active persona
    const getActiveReq = { jsonrpc: '2.0', id: 'g1', method: 'persona.get', params: [activeId] };
    const getActiveRes = await runServer(getActiveReq, { PERSONA_STORAGE_PATH: testStoragePath });
    expect(getActiveRes.exitCode).toBe(0);
    expect(getActiveRes.response?.result?.id).toBe(activeId);

    // Attempt to get the archived persona
    const getArchivedReq = { jsonrpc: '2.0', id: 'g2', method: 'persona.get', params: [archivedId] };
    const getArchivedRes = await runServer(getArchivedReq, { PERSONA_STORAGE_PATH: testStoragePath });
    expect(getArchivedRes.exitCode).toBe(0);
    expect(getArchivedRes.response?.result).toBeFalsy(); // Should not be found
  });

  test('should handle persona.get request for non-existent ID', async () => {
    const getReqId = 'g2';
    const getReq = { jsonrpc: '2.0', id: getReqId, method: 'persona.get', params: ['non-existent-id'] };
    const getRes = await runServer(getReq, { PERSONA_STORAGE_PATH: testStoragePath });

    expect(getRes.exitCode).toBe(0);
    expect(getRes.response?.id).toBe(getReqId);
    expect(getRes.response?.error).toBeUndefined();
    // Result should be null or undefined when not found
    expect(getRes.response?.result).toBeFalsy(); // Accept null or undefined
  });

  test('should handle persona.findByTag request successfully', async () => {
    // Create personas
    const createReq1 = { jsonrpc: '2.0', id: 'c1', method: 'persona.create', params: { name: 'TagA', description: 'd', instructions: 'i', tags: ['tag1', 'common'], settings: {} } };
    const createReq2 = { jsonrpc: '2.0', id: 'c2', method: 'persona.create', params: { name: 'TagB', description: 'd', instructions: 'i', tags: ['tag2', 'common'], settings: {} } };
    await runServer(createReq1, { PERSONA_STORAGE_PATH: testStoragePath });
    await runServer(createReq2, { PERSONA_STORAGE_PATH: testStoragePath });

    // Find by tag 'common'
    const findReqId = 'f1';
    const findReq = { jsonrpc: '2.0', id: findReqId, method: 'persona.findByTag', params: ['common'] };
    const findRes = await runServer(findReq, { PERSONA_STORAGE_PATH: testStoragePath });

    expect(findRes.exitCode).toBe(0);
    expect(findRes.response?.id).toBe(findReqId);
    expect(findRes.response?.error).toBeUndefined();
    expect(Array.isArray(findRes.response?.result)).toBe(true);
    expect(findRes.response?.result).toHaveLength(2);
    expect(findRes.response?.result.map((p: Persona) => p.name)).toEqual(expect.arrayContaining(['TagA', 'TagB']));

    // Find by tag 'tag1'
    const findReqId2 = 'f2';
    const findReq2 = { jsonrpc: '2.0', id: findReqId2, method: 'persona.findByTag', params: ['tag1'] };
    const findRes2 = await runServer(findReq2, { PERSONA_STORAGE_PATH: testStoragePath });
    expect(findRes2.response?.result).toHaveLength(1);
    expect(findRes2.response?.result[0].name).toBe('TagA');

    // Find by non-existent tag
     const findReqId3 = 'f3';
    const findReq3 = { jsonrpc: '2.0', id: findReqId3, method: 'persona.findByTag', params: ['nonexistent'] };
    const findRes3 = await runServer(findReq3, { PERSONA_STORAGE_PATH: testStoragePath });
    expect(findRes3.response?.result).toHaveLength(0);
  });

  test('should handle persona.duplicate request successfully', async () => {
    // Create original
    const createReq = { jsonrpc: '2.0', id: 'c1', method: 'persona.create', params: { name: 'Original', description: 'Desc', instructions: 'Inst', tags: ['orig'], settings: { t: 1 } } };
    const createRes = await runServer(createReq, { PERSONA_STORAGE_PATH: testStoragePath });
    const originalId = createRes.response.result.id;
    const originalName = createRes.response.result.name;

    // Duplicate it
    const dupReqId = 'd1';
    const dupReq = { jsonrpc: '2.0', id: dupReqId, method: 'persona.duplicate', params: [originalId] };
    const dupRes = await runServer(dupReq, { PERSONA_STORAGE_PATH: testStoragePath });

    expect(dupRes.exitCode).toBe(0);
    expect(dupRes.response?.id).toBe(dupReqId);
    expect(dupRes.response?.error).toBeUndefined();
    const duplicate = dupRes.response?.result;
    expect(duplicate).toBeDefined();
    expect(duplicate.id).not.toBe(originalId);
    expect(duplicate.name).toBe(`${originalName} - Copy`);
    expect(duplicate.description).toBe('Desc');
    expect(duplicate.tags).toEqual(['orig']);

    // Check file state
    const storedData = await readStorageFile();
    expect(storedData!.active).toHaveLength(2); // Original + Copy should both be active
    expect(storedData!.archived).toHaveLength(0);
    expect(storedData!.active.find((p: Persona) => p.id === duplicate.id)).toBeDefined();
  });

  test('should handle persona.flush request successfully', async () => {
      // Note: Since the script calls flush after create/duplicate, testing flush 
      // explicitly might not add much value unless we disable that auto-flush.
      // However, we can call it just to ensure the method exists and returns success.
      const flushReqId = 'flush1';
      const flushReq = { jsonrpc: '2.0', id: flushReqId, method: 'persona.flush' };
      const flushRes = await runServer(flushReq, { PERSONA_STORAGE_PATH: testStoragePath });

      expect(flushRes.exitCode).toBe(0);
      expect(flushRes.response?.id).toBe(flushReqId);
      expect(flushRes.response?.error).toBeUndefined();
      expect(flushRes.response?.result?.success).toBe(true);
  });

  // --- Error Handling Tests --- 

  test('should return error for invalid JSON input', async () => {
      // Ensure the string itself is valid JS, but represents invalid JSON
      const invalidJson = '{"jsonrpc": "2.0", "method": "persona.list", "id: 1}'; // Missing closing quote for method, invalid id format
      const result = await runServer(invalidJson, { PERSONA_STORAGE_PATH: testStoragePath });

      expect(result.exitCode).toBe(0); // Script should still exit cleanly
      expect(result.response).toBeDefined();
      expect(result.response.jsonrpc).toBe('2.0');
      expect(result.response.id).toBeNull(); // ID might be unparseable
      expect(result.response.error).toBeDefined();
      expect(result.response.error.code).toBe(PARSE_ERROR);
      expect(result.response.error.message).toContain('Parse error');
  });
  
  test('should return error for invalid JSON-RPC request object', async () => {
      const invalidRequest = { jsonrpc: '1.0', method: 'foo' }; // Invalid version
      const result = await runServer(invalidRequest, { PERSONA_STORAGE_PATH: testStoragePath });

      expect(result.exitCode).toBe(0);
      expect(result.response).toBeDefined();
      expect(result.response.error).toBeDefined();
      expect(result.response.error.code).toBe(INVALID_REQUEST);
      expect(result.response.error.message).toContain('Invalid Request object');
  });

  test('should return error for unknown method', async () => {
      const reqId = 'm1';
      const request = { jsonrpc: '2.0', id: reqId, method: 'persona.nonExistent' };
      const result = await runServer(request, { PERSONA_STORAGE_PATH: testStoragePath });

      expect(result.exitCode).toBe(0);
      expect(result.response?.id).toBe(reqId);
      expect(result.response?.error).toBeDefined();
      expect(result.response?.error.code).toBe(METHOD_NOT_FOUND);
      expect(result.response?.error.message).toContain('Method not found');
  });

  test('should return error for invalid parameters (persona.get)', async () => {
      const reqId = 'p1';
      const request = { jsonrpc: '2.0', id: reqId, method: 'persona.get', params: 'not-an-array' };
      const result = await runServer(request, { PERSONA_STORAGE_PATH: testStoragePath });

      expect(result.exitCode).toBe(0);
      expect(result.response?.id).toBe(reqId);
      expect(result.response?.error).toBeDefined();
      expect(result.response?.error.code).toBe(INVALID_PARAMS);
      expect(result.response?.error.message).toContain('Expected array');
  });

   test('should return internal error for duplicate name on create', async () => {
      // Create one first
      const createReq1 = { jsonrpc: '2.0', id: 'c1', method: 'persona.create', params: { name: 'Duplicate', description: 'd', instructions: 'i', tags: [], settings: {} } };
      await runServer(createReq1, { PERSONA_STORAGE_PATH: testStoragePath });

      // Attempt to create again
      const reqId = 'c2';
      const createReq2 = { jsonrpc: '2.0', id: reqId, method: 'persona.create', params: { name: 'Duplicate', description: 'd2', instructions: 'i2', tags: [], settings: {} } };
      const result = await runServer(createReq2, { PERSONA_STORAGE_PATH: testStoragePath });
      
      expect(result.exitCode).toBe(0);
      expect(result.response?.id).toBe(reqId);
      expect(result.response?.error).toBeDefined();
      expect(result.response?.error.code).toBe(INTERNAL_ERROR); // Registry throws generic Error
      expect(result.response?.error.message).toContain('Persona with name "Duplicate" already exists.');
  });

  // --- Other JSON-RPC Tests ---

  test('should not send response for notification request (id=null)', async () => {
      // Use persona.list as a simple method to call
      const notification = { jsonrpc: '2.0', method: 'persona.list', id: null }; 
      const result = await runServer(notification, { PERSONA_STORAGE_PATH: testStoragePath });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(''); // No response should be written
      expect(result.stderr).not.toContain('error'); // Should process without internal errors
  });

  test('should handle persona.archive request successfully', async () => {
      // Create a persona
     const createReq = { jsonrpc: '2.0', id: 'c1', method: 'persona.create', params: { name: 'ToArchive', description: 'd', instructions: 'i', tags: [], settings: {} } };
     const createRes = await runServer(createReq, { PERSONA_STORAGE_PATH: testStoragePath });
     const personaId = createRes.response.result.id;

     // Archive it
     const archiveReqId = 'a1';
     const archiveReq = { jsonrpc: '2.0', id: archiveReqId, method: 'persona.archive', params: [personaId] };
     const archiveRes = await runServer(archiveReq, { PERSONA_STORAGE_PATH: testStoragePath });

     expect(archiveRes.exitCode).toBe(0);
     expect(archiveRes.response?.id).toBe(archiveReqId);
     expect(archiveRes.response?.error).toBeUndefined();
     expect(archiveRes.response?.result?.success).toBe(true);

     // Verify file state
     const storedData = await readStorageFile();
     expect(storedData!.active).toHaveLength(0); // Should be removed from active
     expect(storedData!.archived).toHaveLength(1); // Should be added to archived
     expect(storedData!.archived[0].id).toBe(personaId);
     expect(storedData!.archived[0].name).toBe('ToArchive');

     // Verify getPersona fails for archived ID
     const getReq = { jsonrpc: '2.0', id: 'g3', method: 'persona.get', params: [personaId] };
     const getRes = await runServer(getReq, { PERSONA_STORAGE_PATH: testStoragePath });
     expect(getRes.response?.result).toBeFalsy(); 
  });

  test('persona.archive should return success:false if ID not found', async () => {
      const archiveReqId = 'a2';
      const archiveReq = { jsonrpc: '2.0', id: archiveReqId, method: 'persona.archive', params: ['non-existent-id'] };
      const archiveRes = await runServer(archiveReq, { PERSONA_STORAGE_PATH: testStoragePath });

      expect(archiveRes.exitCode).toBe(0);
      expect(archiveRes.response?.id).toBe(archiveReqId);
      expect(archiveRes.response?.error).toBeUndefined();
      expect(archiveRes.response?.result?.success).toBe(false);
   });

  // TODO: Add more tests:
  // - persona.update (once implemented)
  // - persona.delete (once implemented)
  // - Error cases (invalid json, unknown method, invalid params, duplicate name error)
  // - Notification request (id=null) - should not produce stdout response
  // - Timeout when no stdin is provided? (Might be tricky to test reliably)

}); 