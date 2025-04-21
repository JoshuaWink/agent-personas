import { PersonaRegistry } from './PersonaRegistry';
import { JsonStorageDriver } from './drivers/JsonStorageDriver';
import { CreatePersonaInput, Persona } from './types';
import { 
  PARSE_ERROR, 
  INVALID_REQUEST, 
  METHOD_NOT_FOUND, 
  INVALID_PARAMS, 
  INTERNAL_ERROR 
} from './rpc-constants'; // Import shared constants

// --- JSON-RPC 2.0 Types --- 
interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any[] | object;
  id: string | number | null;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: JsonRpcError;
  id: string | number | null;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

// --- Script Setup --- 
const STORAGE_FILE_PATH = process.env.PERSONA_STORAGE_PATH || './data/personas.json';

// --- Helper Functions --- 

function createErrorResponse(id: string | number | null, code: number, message: string, data?: any): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

function createSuccessResponse(id: string | number | null, result: any): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function sendResponse(response: JsonRpcResponse) {
  try {
    const responseString = JSON.stringify(response);
    process.stdout.write(responseString + '\n');
  } catch (error) {
    console.error('Fatal Error: Failed to stringify response', error);
    const minimalError = JSON.stringify({ jsonrpc: '2.0', id: response.id, error: { code: INTERNAL_ERROR, message: 'Internal server error: Cannot serialize response' } });
    process.stdout.write(minimalError + '\n');
  }
}

// --- Main Execution Logic --- 

async function processRequest(requestBody: string): Promise<void> {
  let request: JsonRpcRequest | null = null;
  let requestId: string | number | null = null;
  let registry: PersonaRegistry | null = null;

  try {
    // 1. Initialize Registry (do this within the request processing)
    const storageDriver = new JsonStorageDriver(STORAGE_FILE_PATH);
    // Disable autoSave for single-shot execution - rely on explicit flush if needed
    registry = await PersonaRegistry.create(storageDriver, { autoSaveEnabled: false });

    // 2. Parse Request
    const parsedData = JSON.parse(requestBody);
    if (typeof parsedData !== 'object' || parsedData === null || parsedData.jsonrpc !== '2.0' || typeof parsedData.method !== 'string') {
      sendResponse(createErrorResponse(parsedData.id ?? null, INVALID_REQUEST, 'Invalid Request object'));
      return; // Exit after sending error
    }
    request = parsedData as JsonRpcRequest;
    requestId = request.id;

    // 3. Route and Execute Method
    let result: any;
    switch (request.method) {
      case 'persona.create':
        if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) {
           throw { code: INVALID_PARAMS, message: 'Invalid params: Expected object for persona.create' };
        }
        result = await registry.createPersona(request.params as CreatePersonaInput);
        await registry.flush(); // Explicitly save after mutation
        break;

      case 'persona.list':
        result = registry.listPersonas();
        break;

      case 'persona.get':
        if (!request.params || !Array.isArray(request.params) || typeof request.params[0] !== 'string') {
          throw { code: INVALID_PARAMS, message: 'Invalid params: Expected array with persona ID string for persona.get' };
        }
        result = registry.getPersona(request.params[0]);
        break;

      case 'persona.findByTag':
        if (!request.params || !Array.isArray(request.params) || typeof request.params[0] !== 'string') {
          throw { code: INVALID_PARAMS, message: 'Invalid params: Expected array with tag string for persona.findByTag' };
        }
        result = registry.findByTag(request.params[0]);
        break;

      case 'persona.duplicate':
        if (!request.params || !Array.isArray(request.params) || typeof request.params[0] !== 'string') {
           throw { code: INVALID_PARAMS, message: 'Invalid params: Expected array with original persona ID string for persona.duplicate' };
        }
        result = await registry.duplicatePersona(request.params[0]);
        await registry.flush(); // Explicitly save after mutation
        break;

      case 'persona.flush': // Method might be less useful now, but keep for consistency
         await registry.flush();
         result = { success: true, message: 'Flush completed' };
         break;
      
      // --- Add Update and Archive --- 
      case 'persona.update':
         // Validate parameters: must have id (string) and updates (object)
         if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params) || typeof (request.params as any).id !== 'string' || typeof (request.params as any).updates !== 'object' || (request.params as any).updates === null) {
             throw { code: INVALID_PARAMS, message: 'Invalid params: Expected { id: string, updates: Partial<Persona> } for persona.update' };
         }
         
         // Ensure we have a registry instance
         if (!registry) throw { code: INTERNAL_ERROR, message: 'Registry not initialized' }; 

         try {
           const { id, updates } = request.params as { id: string; updates: Partial<Persona> };
           
           // Ensure we only pass valid Persona fields to the registry
           const validUpdates: Partial<Persona> = {};
           if (updates.name !== undefined) validUpdates.name = updates.name;
           if (updates.description !== undefined) validUpdates.description = updates.description;
           if (updates.instructions !== undefined) validUpdates.instructions = updates.instructions;
           if (updates.tags !== undefined) validUpdates.tags = updates.tags;
           if (updates.settings !== undefined) validUpdates.settings = updates.settings;
           // We intentionally do NOT allow updating id, createdAt, updatedAt, or isArchived via this method
           
           result = await registry.updatePersona(id, validUpdates);
           await registry.flush(); // Explicitly save after mutation
         } catch (error: any) {
           // Handle specific errors from registry.updatePersona
           const errorIdParam = (request.params as any).id;
           if (error.message.includes('not found') || error.message.includes('archived')) {
               throw { code: -32001, message: 'Persona not found or is archived', data: { id: errorIdParam } };
           } else if (error.message.includes('already exists')) {
               throw { code: -32002, message: 'Persona name collision', data: { name: (request.params as any).updates?.name } };
           } else {
               // Rethrow other errors to be caught by the generic handler
               throw error; 
           }
         }
         break;

       case 'persona.archive': // Renamed from delete
         if (!request.params || !Array.isArray(request.params) || typeof request.params[0] !== 'string') {
           throw { code: INVALID_PARAMS, message: 'Invalid params: Expected array with persona ID string for persona.archive' };
         }
         // Ensure we have a registry instance
         if (!registry) throw { code: INTERNAL_ERROR, message: 'Registry not initialized' };
         
         // Call the new archivePersona method
         const archived = await registry.archivePersona(request.params[0]); 
         result = { success: archived }; // Result indicates if archiving was successful (i.e., if found)
         if (archived) {
             await registry.flush(); // Explicitly save after mutation
         }
         break;

      default:
        throw { code: METHOD_NOT_FOUND, message: `Method not found: ${request.method}` };
    }

    // 4. Send Success Response (if ID was present)
    if (requestId !== null) {
      sendResponse(createSuccessResponse(requestId, result));
    }

  } catch (error: any) {
    // 5. Handle Errors and Send Error Response
    const errorId = requestId ?? (request ? request.id : null); // Use ID from original request if available
    if (errorId !== null) {
       if (typeof error === 'object' && error !== null && typeof error.code === 'number' && typeof error.message === 'string') {
          sendResponse(createErrorResponse(errorId, error.code, error.message, error.data));
       } else if (error instanceof Error) {
          sendResponse(createErrorResponse(errorId, INTERNAL_ERROR, error.message));
       } else if (error instanceof SyntaxError) {
          sendResponse(createErrorResponse(null, PARSE_ERROR, 'Parse error: Invalid JSON received'));
       } else {
         console.error('[Script] Unknown error processing request:', error);
         sendResponse(createErrorResponse(errorId, INTERNAL_ERROR, 'Internal server error'));
       }
     } else {
         if (error instanceof SyntaxError) {
             sendResponse(createErrorResponse(null, PARSE_ERROR, 'Parse error: Invalid JSON received'));
         } else {
              console.error('[Script] Error processing notification or invalid request:', error);
         }
     }
  } finally {
    // Ensure any scheduled operations are cancelled even if errors occurred
    // (though with autoSave=false, this might be redundant)
    registry?.cancelPendingSave(); 
  }
}

// Read all stdin
let stdinBuffer = '';
process.stdin.on('data', (chunk) => {
  stdinBuffer += chunk;
});

process.stdin.on('end', () => {
  if (!stdinBuffer) {
    sendResponse(createErrorResponse(null, INVALID_REQUEST, 'No input received on stdin'));
    process.exit(1); // Exit with error code if no input
  }
  // Process the received request
  processRequest(stdinBuffer).then(() => {
      process.exit(0); // Exit normally after processing
  }).catch(error => {
      console.error('[Script] Unhandled promise rejection during request processing:', error);
      process.exit(1); // Exit with error code on unhandled rejection
  });
});

// Handle cases where stdin might close unexpectedly or is empty
process.stdin.on('error', (err) => {
  console.error('[Script] stdin error:', err);
  sendResponse(createErrorResponse(null, INTERNAL_ERROR, 'Error reading from stdin'));
  process.exit(1);
});

// Set a timeout in case stdin remains open indefinitely without input
const TIMEOUT_MS = 5000; // 5 seconds
const timeoutHandle = setTimeout(() => {
  if (!stdinBuffer) {
      console.error(`[Script] No input received on stdin within ${TIMEOUT_MS}ms. Exiting.`);
      sendResponse(createErrorResponse(null, INVALID_REQUEST, `No input received on stdin within ${TIMEOUT_MS}ms`));
      process.exit(1);
  }
}, TIMEOUT_MS);

// Clear timeout if stdin closes or ends properly
process.stdin.on('close', () => clearTimeout(timeoutHandle));
process.stdin.on('end', () => clearTimeout(timeoutHandle)); 