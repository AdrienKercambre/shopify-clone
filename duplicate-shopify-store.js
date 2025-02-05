const { GraphQLClient } = require('graphql-request');
require('dotenv').config();
// Configuration des clients GraphQL
const sourceClient = new GraphQLClient(`https://${process.env.SOURCE_STORE_NAME}.myshopify.com/admin/api/${process.env.API_VERSION}/graphql.json`, {
  headers: {
    'X-Shopify-Access-Token': process.env.SOURCE_ACCESS_TOKEN,
  },
});

const targetClient = new GraphQLClient(`https://${process.env.TARGET_STORE_NAME}.myshopify.com/admin/api/${process.env.API_VERSION}/graphql.json`, {
  headers: {
    'X-Shopify-Access-Token': process.env.TARGET_ACCESS_TOKEN,
  },
});

// Requêtes GraphQL
const GET_METAFIELD_DEFINITIONS = `
  query GetMetafieldDefinitions($after: String) {
    metafieldDefinitions(first: 50, after: $after) {
      edges {
        node {
          name
          namespace
          key
          description
          type {
            name
            category
          }
          validations {
            name
            value
          }
          ownerType
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CREATE_METAFIELD_DEFINITION = `
  mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      metafieldDefinition {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_METAOBJECT_DEFINITIONS = `
  query GetMetaobjectDefinitions($after: String) {
    metaobjectDefinitions(first: 50, after: $after) {
      edges {
        node {
          name
          type
          fieldDefinitions {
            name
            key
            type {
              name
            }
            required
            validations {
              name
              value
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CREATE_METAOBJECT_DEFINITION = `
  mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function getAllMetafieldDefinitions() {
  let definitions = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const response = await sourceClient.request(GET_METAFIELD_DEFINITIONS, { after: cursor });
    definitions = definitions.concat(response.metafieldDefinitions.edges.map(edge => edge.node));
    hasNextPage = response.metafieldDefinitions.pageInfo.hasNextPage;
    cursor = response.metafieldDefinitions.pageInfo.endCursor;
  }

  return definitions;
}

async function duplicateMetafieldDefinitions() {
  try {
    const definitions = await getAllMetafieldDefinitions();
    
    for (const def of definitions) {
      const variables = {
        definition: {
          name: def.name,
          namespace: def.namespace,
          key: def.key,
          description: def.description,
          type: def.type.name,
          ownerType: def.ownerType,
          validations: def.validations
        }
      };

      await targetClient.request(CREATE_METAFIELD_DEFINITION, variables);
    }
    console.log('Définitions de metafields dupliquées avec succès');
  } catch (error) {
    console.error('Erreur lors de la duplication des définitions:', error);
  }
}

async function getAllMetaobjectDefinitions() {
  let definitions = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const response = await sourceClient.request(GET_METAOBJECT_DEFINITIONS, { after: cursor });
    definitions = definitions.concat(response.metaobjectDefinitions.edges.map(edge => edge.node));
    hasNextPage = response.metaobjectDefinitions.pageInfo.hasNextPage;
    cursor = response.metaobjectDefinitions.pageInfo.endCursor;
  }

  return definitions;
}

async function duplicateMetaobjectDefinitions() {
  try {
    const definitions = await getAllMetaobjectDefinitions();
    
    for (const def of definitions) {
      const variables = {
        definition: {
          name: def.name,
          type: def.type,
          fieldDefinitions: def.fieldDefinitions.map(field => ({
            name: field.name,
            key: field.key,
            type: field.type.name,
            required: field.required,
            validations: field.validations
          }))
        }
      };

      await targetClient.request(CREATE_METAOBJECT_DEFINITION, variables);
    }
    console.log('Définitions de metaobjects dupliquées avec succès');
  } catch (error) {
    console.error('Erreur lors de la duplication des définitions:', error);
  }
}

async function main() {
  try {
    await duplicateMetafieldDefinitions();
    await duplicateMetaobjectDefinitions();
    console.log('Duplication terminée avec succès');
  } catch (error) {
    console.error('Erreur lors de la duplication:', error);
  }
}

main(); 