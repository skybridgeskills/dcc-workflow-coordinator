import { SecretsManagerClient, GetSecretValueCommand, ListSecretsCommand } from "@aws-sdk/client-secrets-manager";

let CONFIG;
const defaultPort = 4005
const defaultTenantName = "test"
const randomTenantName = "random"
const randomTenantToken = "UNPROTECTED"
const defaultTenantToken = "UNPROTECTED"

const defaultExchangeHost = "http://coordinator:4005"
const defaultCoordinatorService = "COORDINATOR:4005"
const defaultStatusService = "STATUS:4008"
const defaultSigningService = "SIGNING:4006"
const defaultTransactionService = "TRANSACTIONS:4004"

// when developing using locally run, i.e, without docker-compose
//const defaultExchangeHost = "http://localhost:4005"
//const defaultCoordinatorService = "localhost:4005"
//const defaultStatusService = "localhost:4008"
//const defaultSigningService = "localhost:4006"
//const defaultTransactionService = "localhost:4004"

// we set a default tenant
// It will be overwritten by whatever value is set for default in .env
const TENANT_ACCESS_TOKENS = {}

export function initializeConfig() {
  CONFIG = parseConfig();
}

async function parseTenantTokens() {
  // first add default so it can be overridden by env
  TENANT_ACCESS_TOKENS[defaultTenantName] = defaultTenantToken
  // also add the 'random' tenant
  TENANT_ACCESS_TOKENS[randomTenantName] = randomTenantToken

  const allEnvVars = process.env;

  // Check if AWS Secrets Manager secret name is provided
  const awsSecretName = allEnvVars.AWS_SECRET;
  if (awsSecretName && process.env.NODE_ENV !== 'test') {
    console.log("Using AWS Secret Manager")
    try {
      loadSecrets();
    } catch (error) {
      console.error('Error loading tenant tokens from AWS Secrets Manager:', error.message);
      // Fall back to environment variables if AWS Secrets Manager fails
    }
  }

  // Original functionality - load from environment variables
  const tenantKeys = Object.getOwnPropertyNames(allEnvVars)
    .filter(key => key.toUpperCase().startsWith('TENANT_TOKEN_'))
  for (const key of tenantKeys) {
    let value = allEnvVars[key]
    const tenantName = key.slice(13).toLowerCase()
    TENANT_ACCESS_TOKENS[tenantName] = value
  }
}

export async function loadSecrets() {

  const client = new SecretsManagerClient();

  // List all secrets with the specified prefix
  let NextToken = 'INITIAL';
  let SecretList = [];

  while (NextToken) {
    NextToken = NextToken === 'INITIAL' ? undefined : NextToken;
    const listCommand = new ListSecretsCommand({
      Filters: [
        {
          Key: 'name',
          Values: ['tenant']
        }
      ],
      MaxResults: 100,
      NextToken
    });
    const result = await client.send(listCommand);
    NextToken = result.NextToken;
    SecretList = [...SecretList, ...(result.SecretList || [])];
  }


  console.log(`Found ${SecretList?.length || 0} secrets matching prefix tenant`);

  // Process each secret
  for (const secret of SecretList || []) {
    try {
      const getCommand = new GetSecretValueCommand({ SecretId: secret.Name });
      const { SecretString } = await client.send(getCommand);
      const secretData = JSON.parse(SecretString);

      // console.log(secretData)
      // Use the secret name as the key and the seed as the value
      if (secretData.token) {
        TENANT_ACCESS_TOKENS[secret.Name] = secretData.token;
        console.log(`Successfully loaded secret: ${secret.Name}`);
      } else {
        console.log(`Secret ${secret.Name} does not contain a seed value`);
      }
    } catch (error) {
      console.error(`Error processing secret ${secret.Name}:`, error.message);
      // Continue with next secret if one fails
      continue;
    }
  }
}

function parseConfig() {
  const env = process.env
  const config = Object.freeze({
    enableHttpsForDev: env.ENABLE_HTTPS_FOR_DEV?.toLowerCase() === 'true',
    enableAccessLogging: env.ENABLE_ACCESS_LOGGING?.toLowerCase() === 'true',
    enableStatusService: env.ENABLE_STATUS_SERVICE?.toLowerCase() === 'true',
    coordinatorService: env.COORDINATOR_SERVICE ? env.COORDINATOR_SERVICE : defaultCoordinatorService,
    statusService: env.STATUS_SERVICE ? env.STATUS_SERVICE : defaultStatusService,
    signingService: env.SIGNING_SERVICE ? env.SIGNING_SERVICE : defaultSigningService,
    transactionService: env.TRANSACTION_SERVICE ? env.TRANSACTION_SERVICE : defaultTransactionService,
    exchangeHost: env.PUBLIC_EXCHANGE_HOST ? env.PUBLIC_EXCHANGE_HOST : defaultExchangeHost,
    port: env.PORT ? parseInt(env.PORT) : defaultPort
  });
  return config
}

export function getConfig() {
  if (!CONFIG) {
    initializeConfig()
  }
  return CONFIG;
}

export function resetConfig() {
  CONFIG = null;
}

export async function getTenantToken(tenantName) {
  let tenantKey = "tenant/" + tenantName + "/credentials";
  if (!Object.keys(TENANT_ACCESS_TOKENS).length) {
    await parseTenantTokens()
  }

  if (TENANT_ACCESS_TOKENS.hasOwnProperty(tenantKey)) {
    return TENANT_ACCESS_TOKENS[tenantKey];
  } else if (TENANT_ACCESS_TOKENS.hasOwnProperty(tenantName?.toLowerCase())) {
    return TENANT_ACCESS_TOKENS[tenantName?.toLowerCase()]
  } else {
    return null
  }
}

