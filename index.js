import { GraphQLClient } from 'graphql-request';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();
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
  query GetMetafieldDefinitions($after: String, $ownerType: MetafieldOwnerType!) {
    metafieldDefinitions(first: 250, after: $after, ownerType: $ownerType) {
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
    metaobjectDefinitions(first: 250, after: $after) {
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
  mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
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

const UPDATE_METAOBJECT_DEFINITION = `
  mutation UpdateMetaobjectDefinition($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
    metaobjectDefinitionUpdate(id: $id, definition: $definition) {
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

// Liste de tous les types d'objets possibles
const OWNER_TYPES = [
  'ARTICLE',
  'BLOG',
  'COLLECTION',
  'CUSTOMER',
  'ORDER',
  'PAGE',
  'PRODUCT',
  'PRODUCTVARIANT',
  'SHOP'
];

async function getAllMetafieldDefinitions() {
  let allDefinitions = [];
  console.log('🚀 Début de la récupération des définitions de metafields...');
  
  for (const ownerType of OWNER_TYPES) {
    let definitions = [];
    let hasNextPage = true;
    let cursor = null;
    console.log(`\n📦 Traitement des metafields pour le type: ${ownerType}`);

    while (hasNextPage) {
      const response = await sourceClient.request(GET_METAFIELD_DEFINITIONS, { 
        after: cursor,
        ownerType: ownerType 
      });
      const newDefinitions = response.metafieldDefinitions.edges.map(edge => edge.node);
      definitions = definitions.concat(newDefinitions);
      console.log(`  ✓ ${newDefinitions.length} définitions récupérées pour ${ownerType}`);
      
      hasNextPage = response.metafieldDefinitions.pageInfo.hasNextPage;
      cursor = response.metafieldDefinitions.pageInfo.endCursor;
    }

    console.log(`✅ Total pour ${ownerType}: ${definitions.length} définitions`);
    allDefinitions = allDefinitions.concat(definitions);
  }

  console.log(`\n🎉 Total final: ${allDefinitions.length} définitions de metafields`);
  console.log('Exemple de définition:', JSON.stringify(allDefinitions[0], null, 2));
  return allDefinitions;
}

async function duplicateMetafieldDefinitions() {
  try {
    const definitions = await getAllMetafieldDefinitions();
    console.log('\n🔄 Début de la duplication des metafield definitions...');
    
    for (const def of definitions) {
      console.log(`  ⏳ Création de la définition: ${def.namespace}.${def.key} (${def.ownerType})`);
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
      
      try {
        const result = await targetClient.request(CREATE_METAFIELD_DEFINITION, variables);
        if (result.metafieldDefinitionCreate.userErrors.length > 0) {
          console.log(`  ⚠️ Erreur pour ${def.namespace}.${def.key}:`, result.metafieldDefinitionCreate.userErrors);
        } else {
          console.log(`  ✅ Définition créée avec succès: ${def.namespace}.${def.key}`);
        }
      } catch (error) {
        console.error(`  ❌ Erreur lors de la création de ${def.namespace}.${def.key}:`, error.message);
      }
    }
  } catch (error) {
    console.error('❌ Erreur globale:', error);
  }
}

async function getAllMetaobjectDefinitions() {
  console.log('\n🚀 Début de la récupération des définitions de metaobjects...');
  let definitions = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const response = await sourceClient.request(GET_METAOBJECT_DEFINITIONS, { after: cursor });
    const newDefinitions = response.metaobjectDefinitions.edges.map(edge => edge.node);
    definitions = definitions.concat(newDefinitions);
    hasNextPage = response.metaobjectDefinitions.pageInfo.hasNextPage;
    cursor = response.metaobjectDefinitions.pageInfo.endCursor;
  }

  console.log(`\n🎉 Total: ${definitions.length} définitions de metaobjects`);
  console.log('📝 Liste complète des types:', definitions.map(def => def.type).join(', '));
  return definitions;
}

async function duplicateMetaobjectDefinitions() {
  try {
    const definitions = await getAllMetaobjectDefinitions();
    console.log('\n🔄 Début de la duplication des metaobject definitions...');
    
    // Première étape : créer tous les metaobjects sans champs
    console.log('\n📦 Création des structures de base...');
    for (const def of definitions) {
      console.log(`\n⏳ Création de la structure pour: ${def.type}`);
      
      const variables = {
        definition: {
          name: def.name,
          type: def.type,
          fieldDefinitions: [] // Aucun champ pour l'instant
        }
      };
      
      try {
        const result = await targetClient.request(CREATE_METAOBJECT_DEFINITION, variables);
        if (result.metaobjectDefinitionCreate.userErrors.length > 0) {
          const errors = result.metaobjectDefinitionCreate.userErrors;
          
          if (errors.some(e => e.message === 'Type has already been taken')) {
            console.log(`  ℹ️ Le type ${def.type} existe déjà dans la boutique cible`);
            continue;
          }
          
          console.log(`  ⚠️ Erreurs pour ${def.type}:`, errors);
        } else {
          console.log(`  ✅ Structure créée avec succès: ${def.type}`);
        }
      } catch (error) {
        console.error(`  ❌ Erreur lors de la création de ${def.type}:`, error.message);
      }
    }

    // Deuxième étape : récupérer les IDs des metaobjects dans la boutique cible
    console.log('\n🔍 Récupération des IDs des metaobjects...');
    const GET_METAOBJECT_DEFINITIONS_IDS = `
      query GetMetaobjectDefinitionsIds {
        metaobjectDefinitions(first: 250) {
          edges {
            node {
              id
              type
            }
          }
        }
      }
    `;
    
    const targetDefinitionsResponse = await targetClient.request(GET_METAOBJECT_DEFINITIONS_IDS);
    const targetDefinitionsMap = new Map(
      targetDefinitionsResponse.metaobjectDefinitions.edges.map(edge => [edge.node.type, edge.node.id])
    );

    // Troisième étape : ajouter tous les champs
    console.log('\n📝 Ajout des champs pour chaque metaobject...');
    for (const def of definitions) {
      console.log(`\n⏳ Ajout des champs pour: ${def.type}`);
      
      const definitionId = targetDefinitionsMap.get(def.type);
      if (!definitionId) {
        console.log(`  ⚠️ ID non trouvé pour ${def.type}, passage au suivant`);
        continue;
      }

      const updateVariables = {
        id: definitionId,
        definition: {
          fieldDefinitions: {
            operations: def.fieldDefinitions.map(field => ({
              add: {
                name: field.name,
                key: field.key,
                type: field.type.name,
                required: field.required,
                validations: field.validations || []
              }
            }))
          }
        }
      };

      try {
        console.log(`  📝 Tentative de mise à jour avec ${updateVariables.definition.fieldDefinitions.operations.length} champs`);
        const result = await targetClient.request(UPDATE_METAOBJECT_DEFINITION, updateVariables);
        if (result.metaobjectDefinitionUpdate.userErrors.length > 0) {
          console.log(`  ⚠️ Erreurs lors de la mise à jour de ${def.type}:`, result.metaobjectDefinitionUpdate.userErrors);
          // Essayons d'ajouter les champs un par un
          console.log(`  🔄 Tentative d'ajout des champs un par un...`);
          for (const field of def.fieldDefinitions) {
            const singleFieldUpdate = {
              id: definitionId,
              definition: {
                fieldDefinitions: {
                  operations: [{
                    add: {
                      name: field.name,
                      key: field.key,
                      type: field.type.name,
                      required: field.required,
                      validations: field.validations || []
                    }
                  }]
                }
              }
            };
            try {
              const singleResult = await targetClient.request(UPDATE_METAOBJECT_DEFINITION, singleFieldUpdate);
              if (singleResult.metaobjectDefinitionUpdate.userErrors.length > 0) {
                console.log(`    ⚠️ Erreur pour le champ ${field.name}:`, singleResult.metaobjectDefinitionUpdate.userErrors);
              } else {
                console.log(`    ✅ Champ ${field.name} ajouté avec succès`);
              }
            } catch (fieldError) {
              console.error(`    ❌ Erreur lors de l'ajout du champ ${field.name}:`, fieldError.message);
            }
          }
        } else {
          console.log(`  ✅ Tous les champs ajoutés avec succès pour: ${def.type}`);
        }
      } catch (error) {
        console.error(`  ❌ Erreur lors de la mise à jour de ${def.type}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur globale:', error);
  }
}

async function exportDefinitions() {
  try {
    console.log('🚀 Début de l\'export des définitions...');
    
    // Récupération des metafield definitions
    const metafieldDefinitions = await getAllMetafieldDefinitions();
    console.log(`✅ ${metafieldDefinitions.length} définitions de metafields récupérées`);

    // Récupération des metaobject definitions
    const metaobjectDefinitions = await getAllMetaobjectDefinitions();
    console.log(`✅ ${metaobjectDefinitions.length} définitions de metaobjects récupérées`);

    // Création de l'objet final
    const definitions = {
      metafields: metafieldDefinitions.map(def => ({
        name: def.name,
        namespace: def.namespace,
        key: def.key,
        description: def.description,
        type: def.type.name,
        ownerType: def.ownerType,
        validations: def.validations || []
      })),
      metaobjects: metaobjectDefinitions.map(def => ({
        name: def.name,
        type: def.type,
        fieldDefinitions: def.fieldDefinitions.map(field => ({
          name: field.name,
          key: field.key,
          type: field.type.name,
          required: field.required,
          validations: field.validations || []
        }))
      }))
    };

    // Écriture du fichier
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `definitions_export_${timestamp}.json`;
    fs.writeFileSync(fileName, JSON.stringify(definitions, null, 2));
    console.log(`\n✨ Export terminé ! Fichier généré : ${fileName}`);

    // Afficher quelques statistiques
    console.log('\n📊 Statistiques :');
    console.log(`- ${definitions.metafields.length} définitions de metafields`);
    console.log(`- ${definitions.metaobjects.length} définitions de metaobjects`);
    console.log(`- Types de metaobjects : ${definitions.metaobjects.map(d => d.type).join(', ')}`);

  } catch (error) {
    console.error('❌ Erreur lors de l\'export:', error);
  }
}

// Fonction pour importer et créer les définitions
async function importDefinitions(filePath) {
  try {
    console.log(`🚀 Début de l'import depuis ${filePath}...`);
    
    // Lecture du fichier
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Création des metafield definitions
    console.log('\n📝 Création des metafield definitions...');
    for (const def of data.metafields) {
      try {
        const variables = {
          definition: {
            name: def.name,
            namespace: def.namespace,
            key: def.key,
            description: def.description,
            type: def.type,
            ownerType: def.ownerType,
            validations: def.validations
          }
        };
        
        const result = await targetClient.request(CREATE_METAFIELD_DEFINITION, variables);
        if (result.metafieldDefinitionCreate.userErrors.length > 0) {
          console.log(`  ⚠️ Erreur pour ${def.namespace}.${def.key}:`, result.metafieldDefinitionCreate.userErrors);
        } else {
          console.log(`  ✅ Metafield définition créée: ${def.namespace}.${def.key}`);
        }
      } catch (error) {
        console.error(`  ❌ Erreur pour ${def.namespace}.${def.key}:`, error.message);
      }
    }

    // Création des metaobject definitions
    console.log('\n📝 Création des metaobject definitions...');
    for (const def of data.metaobjects) {
      try {
        const variables = {
          definition: {
            name: def.name,
            type: def.type,
            fieldDefinitions: def.fieldDefinitions
          }
        };
        
        const result = await targetClient.request(CREATE_METAOBJECT_DEFINITION, variables);
        if (result.metaobjectDefinitionCreate.userErrors.length > 0) {
          console.log(`  ⚠️ Erreur pour ${def.type}:`, result.metaobjectDefinitionCreate.userErrors);
        } else {
          console.log(`  ✅ Metaobject définition créée: ${def.type}`);
        }
      } catch (error) {
        console.error(`  ❌ Erreur pour ${def.type}:`, error.message);
      }
    }

    console.log('\n✨ Import terminé !');

  } catch (error) {
    console.error('❌ Erreur lors de l\'import:', error);
  }
}

// Export la fonction principale
async function main() {
  // Pour exporter les définitions
  await exportDefinitions();
  
  // Pour importer les définitions (décommenter et spécifier le chemin du fichier)
  // await importDefinitions('./definitions_export_2024-XX-XX.json');
}

main(); 