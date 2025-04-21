# 🧠 Agent Persona Registry (MCP Server)

A lightweight, fast, and durable service for managing AI Agent personas, accessible via a stdio JSON-RPC 2.0 interface (Model Context Protocol compatible).
Built for **in-memory speed**, **disk-backed durability** using JSON, and easy integration into agent workflows via Docker.

---

## ✨ Features

- **CRUD Operations:** Create, retrieve, list, duplicate, and archive personas.
- **Querying:** Find personas by tag.
- **Memory-first design:** Fast access from an in-memory store.
- **Durable Persistence:** Automatically saves active and archived personas to a JSON file.
  - Configurable debounced saving minimizes I/O.
  - Explicit `flush` method available.
- **MCP Interface:** Communicates via JSON-RPC 2.0 over standard input/output.
- **Dockerized:** Packaged in a Docker container for easy deployment and dependency management.
- **Local Archiving:** Supports archiving personas locally (moving them out of the active list but keeping the data).

---

## 📦 Data Model

```typescript
// Represents the data structure for a persona
export type Persona = {
  id: string;                   // Unique identifier (UUID v4)
  name: string;                 // Unique (within active), human-readable name
  description: string;          // Short summary
  instructions: string;         // Core instructions/prompt for the persona
  tags: string[];               // Searchable tags (topics, roles, capabilities)
  settings: Record<string, any>; // Flexible settings object (e.g., { temperature: 0.7 })
  createdAt: string;            // ISO 8601 timestamp of creation
  updatedAt: string;            // ISO 8601 timestamp of last update
};

// Input type for creating a new persona (system fields omitted)
export type CreatePersonaInput = Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>;
```

---

## 🚀 Getting Started

### Prerequisites

*   [Node.js](https://nodejs.org/) (v18 or later recommended)
*   [npm](https://www.npmjs.com/)
*   [Docker](https://www.docker.com/) (for containerized deployment)

### Installation & Local Development

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/JoshuaWink/agent-personas.git
    cd agent-personas
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Build the project:**
    ```bash
    npm run build
    ```
4.  **Run tests:**
    ```bash
    npm test
    ```

### Running the MCP Server Locally (for testing/dev)

You can run the compiled server script directly using Node.js:

```bash
# Ensure you have built the project first (npm run build)
node dist/server.js
```

The script will then wait for a single JSON-RPC 2.0 request object on standard input, process it, print the response to standard output, and exit.

**Example Interaction:**

```bash
# Pipe a create request into the server
echo '{"jsonrpc":"2.0","id":1,"method":"persona.create","params":{"name":"My Test Persona","description":"Test desc","instructions":"Act like a test","tags":["test"],"settings":{}}}' | node dist/server.js

# Expected Output (example):
# {"jsonrpc":"2.0","id":1,"result":{"name":"My Test Persona","description":"Test desc","instructions":"Act like a test","tags":["test"],"settings":{},"id":"...","createdAt":"...","updatedAt":"..."}}
```

--- 

## 🐳 Docker Usage

The primary way to run this service is via Docker.

1.  **Build the Docker image:**
    ```bash
    docker build -t agent-personas-server .
    ```
2.  **Run the container:**

    To run the container and interact with it via stdio:
    ```bash
    docker run --rm -i \
      -v "$(pwd)/local_persona_data:/app/data" \
      agent-personas-server
    ```
    *   `--rm`: Automatically remove the container when it exits.
    *   `-i`: Keep STDIN open even if not attached (needed for piping input).
    *   `-v "$(pwd)/local_persona_data:/app/data"`: **Crucial!** This mounts a local directory (`local_persona_data` in your current path) into the container at `/app/data`. This ensures your persona data (`personas.json`) persists outside the container.

3.  **Interact with the running container:**

    You can pipe JSON-RPC requests into the running container:
    ```bash
    echo '{"jsonrpc":"2.0","id":2,"method":"persona.list"}' | docker run --rm -i -v "$(pwd)/local_persona_data:/app/data" agent-personas-server
    ```

    Or, for more complex interactions, use a client script or tool that can manage the stdio communication.

**Note on Data Persistence:** Without mounting a volume (`-v`), any personas created will be lost when the container stops.

--- 

## ⚙️ MCP / JSON-RPC 2.0 API

The server communicates via JSON-RPC 2.0 messages over standard input and standard output.

**Request Format:**

```json
{
  "jsonrpc": "2.0",
  "method": "method.name",
  "params": { /* object */ } | [ /* array */ ],
  "id": "request_id" /* string, number, or null for notifications */
}
```

**Response Format (Success):**

```json
{
  "jsonrpc": "2.0",
  "result": { /* method-specific result */ },
  "id": "request_id"
}
```

**Response Format (Error):**

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": number,    /* Standard JSON-RPC error code */
    "message": string, /* Error description */
    "data": any      /* Optional additional info */
  },
  "id": "request_id" /* or null if request ID couldn't be determined */
}
```

### Available Methods:

| Method              | Parameters (`params`)                                     | Result (`result`)                                       |
|---------------------|-----------------------------------------------------------|---------------------------------------------------------|
| `persona.create`    | `CreatePersonaInput` (object)                             | The created `Persona` object                             |
| `persona.list`      | _(none)_                                                  | Array of active `Persona` objects                       |
| `persona.get`       | `[string]` (array containing the persona ID)            | The found `Persona` object, or `null` if not found      |
| `persona.findByTag` | `[string]` (array containing the tag)                   | Array of active `Persona` objects containing the tag    |
| `persona.duplicate` | `[string]` (array containing the original persona ID)     | The newly created duplicate `Persona` object            |
| `persona.archive`   | `[string]` (array containing the persona ID to archive) | `{ success: boolean }` (true if found and archived)   |
| `persona.flush`     | _(none)_                                                  | `{ success: true, message: string }`                    |
| `persona.update`    | `(object)` _(Not Yet Implemented)_                        | _(Not Yet Implemented)_                                  |

--- 

## 💾 Storage Behavior

- **File:** Uses a single JSON file (default: `./data/personas.json` inside the container, configurable via `PERSONA_STORAGE_PATH` env var).
- **Structure:** The JSON file stores an object `{ "active": [], "archived": [] }`.
- **Loading:** On startup, the script loads both active and archived personas into memory.
- **Saving:** Changes (create, duplicate, archive) trigger an **explicit save** to the JSON file before the script exits.

--- 

## 🧩 Extending the System

- **Implement `persona.update`:** Add the missing update functionality.
- **Implement Unarchive:** Add a method to restore archived personas.
- **Add More Validation:** Enhance input validation for JSON-RPC parameters.
- **Alternative Storage Drivers:** While the MCP server uses `JsonStorageDriver`, the core `PersonaRegistry` library supports different drivers (implement the `StorageDriver` interface).
- **Cloud Archiving:** Extend the archive feature to optionally push archived data to S3/Glacier.

--- 

## 🌟 Future Enhancements (Vision)

These are planned additions to further enhance the registry's capabilities:

- **Versioning & History:**
  - Implement a system to track changes to personas over time (using `createdAt`/`updatedAt`).
  - Generate diffs between versions.
  - Potentially store history in a separate, optimized data store (e.g., append-only log, time-series DB) to keep the primary JSON clean.
  - Introduce semantic versioning (e.g., `v1.0.1`) based on change type (Major.Minor.Patch).
- **Duplication / Cloning:** (Implemented via `persona.duplicate`)
- **Improved Validation:** (Partially implemented via duplicate name check)
  - Add robust validation for persona data within storage drivers during `load`.
- **Storage Driver Expansion:**
  - Add `ProtobufStorageDriver` for performance.
  - Explore database drivers (SQLite, etc.).

--- 

## 🛡 Design Philosophy

- **Memory-first:** The registry operates primarily on in-memory data for speed.
- **Explicit Persistence:** For the MCP server, saves happen explicitly after mutations.
- **Simple Interface:** JSON-RPC 2.0 provides a standardized way for different clients (like LLMs) to interact.
- **Containerized:** Docker provides a consistent environment.

--- 

## 📜 License

MIT 