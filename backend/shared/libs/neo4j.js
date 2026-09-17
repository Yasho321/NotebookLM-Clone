import "./env.js";
import neo4j from "neo4j-driver";

let driverInstance = null;

/**
 * Returns a shared singleton Neo4j driver with connection pooling.
 * Reusing the driver eliminates the ~300ms overhead of establishing
 * new TCP connections on every chat turn and prevents socket exhaustion.
 *
 * @returns {import("neo4j-driver").Driver}
 */
export function getNeo4jDriver() {
  if (!driverInstance) {
    const uri = process.env.NEO4J_URI;
    const user = process.env.NEO4J_USERNAME;
    const password = process.env.NEO4J_PASSWORD;

    if (!uri || !user || !password) {
      console.warn("⚠️ Neo4j credentials missing in environment variables.");
      return null;
    }

    driverInstance = neo4j.driver(
      uri,
      neo4j.auth.basic(user, password),
      {
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 5000,
        maxTransactionRetryTime: 15000,
      }
    );

    console.log("🔗 Neo4j connection pool initialized (singleton).");
  }

  return driverInstance;
}

/**
 * Helper to safely execute a Cypher query using the pooled driver.
 *
 * @param {string} cypher - The Cypher query string
 * @param {object} [params={}] - Query parameters
 * @param {string} [database] - Target database name
 * @returns {Promise<{ records: Array, summary: object }>}
 */
export async function executeCypher(cypher, params = {}, database = null) {
  const driver = getNeo4jDriver();
  if (!driver) {
    return { records: [], summary: null };
  }

  const targetDb = database || process.env.NEO4J_DATABASE || process.env.NEO4J_DATABASE_NAME || "neo4j";

  return await driver.executeQuery(cypher, params, { database: targetDb });
}

/**
 * Closes the Neo4j driver connection pool gracefully on application shutdown.
 */
export async function closeNeo4jDriver() {
  if (driverInstance) {
    await driverInstance.close();
    driverInstance = null;
    console.log("🛑 Neo4j connection pool closed.");
  }
}
