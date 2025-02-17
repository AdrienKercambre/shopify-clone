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
      createdDefinition {
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
        name
        displayNameKey
        fieldDefinitions {
          name
          key
          type {
            name
          }
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const GET_METAOBJECT_DEFINITIONS_IDS = `
  query GetMetaobjectDefinitionsIds {
    metaobjectDefinitions(first: 250) {
      edges {
        node {
          id
          type
          name
        }
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
    const targetDefinitionsResponse = await targetClient.request(GET_METAOBJECT_DEFINITIONS_IDS);
    const targetDefinitionsMap = new Map(
      targetDefinitionsResponse.metaobjectDefinitions.edges.map(edge => [edge.node.type, edge.node.id])
    );

    // Troisième étape : ajouter tous les champs
    console.log('\n🔄 Début de la mise à jour des définitions de metaobjects...');
    for (const def of definitions) {
      console.log(`\n🔍 Traitement du metaobjet : ${def.name} (type: ${def.type})`);
      const definitionId = targetDefinitionsMap.get(def.type);
      if (!definitionId) {
        console.log(`  ⚠️ Pas d'ID trouvé pour ce type de metaobjet`);
        continue;
      }

      try {
        console.log(`\n📝 Liste des champs à créer :`);
        def.fieldDefinitions.forEach(field => {
          if (field.type.name.includes('metaobject_reference') || field.type.name.includes('mixed_reference')) {
            console.log(`    - ${field.name} (type: ${field.type.name}) ⭐`);
          } else {
            console.log(`    - ${field.name} (type: ${field.type.name})`);
          }
        });

        const updateVariables = {
          id: definitionId,
          definition: {
            fieldDefinitions: def.fieldDefinitions.map(field => {
              if (field.type.name.includes('metaobject_reference') || field.type.name.includes('mixed_reference')) {
                console.log(`\n🔗 Configuration de la référence pour le champ "${field.name}" :`);

                const matchingDefinition = targetDefinitionsResponse.metaobjectDefinitions.edges.find(edge => 
                  field.name.toLowerCase().includes(edge.node.name.toLowerCase())
                );

                if (matchingDefinition) {
                  console.log(`    ✅ Metaobjet cible trouvé :
    - Nom : ${matchingDefinition.node.name}
    - Type : ${matchingDefinition.node.type}
    - Type utilisé pour validation : ${matchingDefinition.node.type.toLowerCase()}
    - Validation finale : ${JSON.stringify([matchingDefinition.node.type.toLowerCase()])}
  `);

                  if (field.type.name.includes('metaobject_reference')) {
                    return {
                      create: {
                        name: field.name,
                        key: field.key,
                        type: field.type.name,
                        required: field.required,
                        validations: [{
                          name: 'metaobject_definition_id',
                          value: matchingDefinition.node.id
                        }]
                      }
                    };
                  } else {
                    return {
                      create: {
                        name: field.name,
                        key: field.key,
                        type: field.type.name,
                        required: field.required,
                        validations: [{
                          name: 'metaobject_definition_ids',
                          value: JSON.stringify([matchingDefinition.node.id])
                        }]
                      }
                    };
                  }
                } else {
                  console.log(`    ❌ Aucun metaobjet cible trouvé pour le champ "${field.name}"`);
                }
              }
              
              return {
                create: {
                  name: field.name,
                  key: field.key,
                  type: field.type.name,
                  required: field.required,
                  validations: field.validations || []
                }
              };
            })
          }
        };

        const result = await targetClient.request(UPDATE_METAOBJECT_DEFINITION, updateVariables);
        if (result.metaobjectDefinitionUpdate.userErrors.length > 0) {
          console.log(`\n  ℹ️ Résultat de la mise à jour :`);
          result.metaobjectDefinitionUpdate.userErrors.forEach(error => {
            if (error.message.includes('is already taken')) {
              const fieldName = error.message.split('"')[1];
              console.log(`    ℹ️ Le champ "${fieldName}" existe déjà dans la définition`);
            } else {
              console.log(`    ⚠️ ${error.message}`);
            }
          });
        } else {
          console.log(`\n  ✅ Tous les champs ont été ajoutés avec succès`);
        }
      } catch (error) {
        console.error(`\n  ❌ Erreur lors de la mise à jour :`, error.message);
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

async function migrateShopifyData() {
  try {
    console.log('🚀 Début de la migration complète...');
    
    // 1. Export des définitions dans un fichier JSON
    console.log('\n📦 Étape 1: Export des définitions...');
    const definitions = {
      metafields: await getAllMetafieldDefinitions(),
      metaobjects: await getAllMetaobjectDefinitions()
    };

    // Sauvegarde dans un fichier JSON
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `full_export_${timestamp}.json`;
    fs.writeFileSync(fileName, JSON.stringify(definitions, null, 2));
    console.log(`✅ Définitions exportées dans ${fileName}`);

    // 2. Création des définitions sur la boutique cible
    console.log('\n📝 Étape 2: Création des définitions sur la boutique cible...');
    
    // 2.1 Création des metafield definitions
    console.log('\n  2.1 Création des metafield definitions...');
    for (const def of definitions.metafields) {
      try {
        const variables = {
          definition: {
            name: def.name,
            namespace: def.namespace,
            key: def.key,
            description: def.description,
            type: def.type.name,
            ownerType: def.ownerType,
            validations: def.validations || []
          }
        };
        
        const result = await targetClient.request(CREATE_METAFIELD_DEFINITION, variables);
        if (result.metafieldDefinitionCreate.userErrors.length > 0) {
          const errors = result.metafieldDefinitionCreate.userErrors;
          if (errors.some(e => e.message.includes('Key is in use'))) {
            console.log(`  ℹ️ La définition ${def.namespace}.${def.key} existe déjà`);
            continue;
          }
          console.log(`  ⚠️ Erreur pour ${def.namespace}.${def.key}:`, errors);
        } else {
          console.log(`  ✅ Metafield définition créée: ${def.namespace}.${def.key}`);
        }
      } catch (error) {
        console.error(`  ❌ Erreur pour ${def.namespace}.${def.key}:`, error.message);
      }
    }

    // 2.2 Création des structures de metaobject definitions
    console.log('\n  2.2 Création des structures de metaobject definitions...');
    for (const def of definitions.metaobjects) {
      try {
        const variables = {
          definition: {
            name: def.name,
            type: def.type,
            fieldDefinitions: [] // Structure vide
          }
        };
        
        const result = await targetClient.request(CREATE_METAOBJECT_DEFINITION, variables);
        if (result.metaobjectDefinitionCreate.userErrors.length > 0) {
          const errors = result.metaobjectDefinitionCreate.userErrors;
          if (errors.some(e => e.message === 'Type has already been taken')) {
            console.log(`  ℹ️ La définition ${def.type} existe déjà`);
            continue;
          }
          console.log(`  ⚠️ Erreur pour ${def.type}:`, errors);
        } else {
          console.log(`  ✅ Structure créée: ${def.type}`);
        }
      } catch (error) {
        console.error(`  ❌ Erreur pour ${def.type}:`, error.message);
      }
    }

    // 2.3 Ajout des champs aux metaobject definitions
    console.log('\n🔄 Début de la mise à jour des définitions de metaobjects...');
    const targetDefinitions = await targetClient.request(GET_METAOBJECT_DEFINITIONS_IDS);

    console.log('\n📋 Metaobjects disponibles dans la boutique cible :');
    targetDefinitions.metaobjectDefinitions.edges.forEach(edge => {
      console.log(`  - ${edge.node.name} (type: ${edge.node.type}, id: ${edge.node.id})`);
    });

    const targetDefinitionsMap = new Map(
      targetDefinitions.metaobjectDefinitions.edges.map(edge => [edge.node.type, edge.node.id])
    );

    for (const def of definitions.metaobjects) {
      console.log(`\n\n🔍 Traitement du metaobjet : ${def.name} (type: ${def.type})`);
      const definitionId = targetDefinitionsMap.get(def.type);
      if (!definitionId) {
        console.log(`  ⚠️ Pas d'ID trouvé pour ce type de metaobjet`);
        continue;
      }

      try {
        console.log(`\n  📝 Liste des champs à créer :`);
        def.fieldDefinitions.forEach(field => {
          if (field.type.name.includes('metaobject_reference') || field.type.name.includes('mixed_reference')) {
            console.log(`    - ${field.name} (type: ${field.type.name}) ⭐`);
          } else {
            console.log(`    - ${field.name} (type: ${field.type.name})`);
          }
        });

        const updateVariables = {
          id: definitionId,
          definition: {
            fieldDefinitions: def.fieldDefinitions.map(field => {
              if (field.type.name.includes('metaobject_reference') || field.type.name.includes('mixed_reference')) {
                console.log(`\n🔗 Configuration de la référence pour le champ "${field.name}" :`);

                const matchingDefinition = targetDefinitions.metaobjectDefinitions.edges.find(edge => 
                  field.name.toLowerCase().includes(edge.node.name.toLowerCase())
                );

                if (matchingDefinition) {
                  console.log(`    ✅ Metaobjet cible trouvé :
    - Nom : ${matchingDefinition.node.name}
    - Type : ${matchingDefinition.node.type}
    - Type utilisé pour validation : ${matchingDefinition.node.type.toLowerCase()}
    - Validation finale : ${JSON.stringify([matchingDefinition.node.type.toLowerCase()])}
  `);

                  if (field.type.name.includes('metaobject_reference')) {
                    return {
                      create: {
                        name: field.name,
                        key: field.key,
                        type: field.type.name,
                        required: field.required,
                        validations: [{
                          name: 'metaobject_definition_id',
                          value: matchingDefinition.node.id
                        }]
                      }
                    };
                  } else {
                    return {
                      create: {
                        name: field.name,
                        key: field.key,
                        type: field.type.name,
                        required: field.required,
                        validations: [{
                          name: 'metaobject_definition_ids',
                          value: JSON.stringify([matchingDefinition.node.id])
                        }]
                      }
                    };
                  }
                } else {
                  console.log(`    ❌ Aucun metaobjet cible trouvé pour le champ "${field.name}"`);
                }
              }
              
              return {
                create: {
                  name: field.name,
                  key: field.key,
                  type: field.type.name,
                  required: field.required,
                  validations: field.validations || []
                }
              };
            })
          }
        };

        const result = await targetClient.request(UPDATE_METAOBJECT_DEFINITION, updateVariables);
        if (result.metaobjectDefinitionUpdate.userErrors.length > 0) {
          console.log(`\n  ℹ️ Résultat de la mise à jour :`);
          result.metaobjectDefinitionUpdate.userErrors.forEach(error => {
            if (error.message.includes('is already taken')) {
              const fieldName = error.message.split('"')[1];
              console.log(`    ℹ️ Le champ "${fieldName}" existe déjà dans la définition`);
            } else {
              console.log(`    ⚠️ ${error.message}`);
            }
          });
        } else {
          console.log(`\n  ✅ Tous les champs ont été ajoutés avec succès`);
        }
      } catch (error) {
        console.error(`\n  ❌ Erreur lors de la mise à jour :`, error.message);
      }
    }

    console.log('\n Migration terminée !');
    console.log(`📋 Récapitulatif des données exportées dans ${fileName}`);
   /*  // 3. Copie des valeurs
    console.log('\n📝 Étape 3: Copie des valeurs...');
    
    // 3.1 Copie des metafields
    await copyMetafieldValues();
    
    // 3.2 Copie des metaobjects
    await copyMetaobjectValues();

    console.log('\n🎉 Migration terminée !');
    console.log(`📋 Récapitulatif des données exportées dans ${fileName}`);
    console.log(`- ${definitions.metafields.length} définitions de metafields`);
    console.log(`- ${definitions.metaobjects.length} définitions de metaobjects`); */

  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
  }
}

// Lancer la migration
migrateShopifyData(); 