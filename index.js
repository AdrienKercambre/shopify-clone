import { GraphQLClient } from 'graphql-request';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

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
          description
          fieldDefinitions {
            name
            key
            description
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
          description: def.description,
          access: {
            storefront: "PUBLIC_READ"
          },
          capabilities: {
            publishable: {
              enabled: true
            }
          },
          fieldDefinitions: [] // Aucun champ pour l'instant
        }
      };
      
      try {
        const result = await this.targetClient.request(CREATE_METAOBJECT_DEFINITION, variables);
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
                console.log(`\n  🔗 Configuration de la référence pour le champ "${field.name}" :
    - Clé : ${field.key}
    - Type : ${field.type.name}`);

                // Chercher le metaobjet en gérant le cas singulier/pluriel
                const matchingDefinition = targetDefinitionsResponse.metaobjectDefinitions.edges.find(edge => {
                  const fieldKey = field.key.toLowerCase();
                  const metaobjectType = edge.node.type.toLowerCase();
                  
                  return fieldKey === metaobjectType || // Égalité exacte
                         (fieldKey === `${metaobjectType}s`) || // Pluriel simple
                         (fieldKey.slice(0, -1) === metaobjectType) || // Du pluriel vers le singulier
                         (`${fieldKey}s` === metaobjectType); // Du singulier vers le pluriel
                });

                if (matchingDefinition) {
                  console.log(`    ✅ Metaobjet cible trouvé :
    - Nom du champ : ${field.name}
    - Clé du champ : ${field.key}
    - Type du metaobjet : ${matchingDefinition.node.type}
    - ID : ${matchingDefinition.node.id}`);

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
                  description: field.description,
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
          for (const error of result.metaobjectDefinitionUpdate.userErrors) {
            if (error.message.includes('is already taken')) {
              const fieldName = error.message.split('"')[1];
              console.log(`    ℹ️ Le champ "${fieldName}" existe déjà dans la définition`);
              
              // Trouver le champ source avec sa description
              const sourceField = def.fieldDefinitions.find(f => f.key === fieldName);
              if (sourceField?.description) {
                try {
                  // Mise à jour de la description du champ existant
                  const updateResult = await targetClient.request(UPDATE_METAOBJECT_DEFINITION, {
                    id: definitionId,
                    definition: {
                      fieldDefinitions: [{
                        update: {
                          key: fieldName,
                          description: sourceField.description
                        }
                      }]
                    }
                  });
                  
                  if (updateResult.metaobjectDefinitionUpdate.userErrors.length === 0) {
                    console.log(`      ✅ Description mise à jour pour le champ "${fieldName}"`);
                  } else {
                    console.log(`      ⚠️ Impossible de mettre à jour la description du champ "${fieldName}"`);
                  }
                } catch (updateError) {
                  console.log(`      ❌ Erreur lors de la mise à jour de la description : ${updateError.message}`);
                }
              }
            } else {
              console.log(`    ⚠️ ${error.message}`);
            }
          }
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

class ManageMeta {
  constructor(sourceStoreName, sourceAccessToken, targetStoreName, targetAccessToken, apiVersion) {
    this.sourceClient = new GraphQLClient(`https://${sourceStoreName}.myshopify.com/admin/api/${apiVersion}/graphql.json`, {
      headers: {
        'X-Shopify-Access-Token': sourceAccessToken,
      },
    });
    this.targetClient = new GraphQLClient(`https://${targetStoreName}.myshopify.com/admin/api/${apiVersion}/graphql.json`, {
      headers: {
        'X-Shopify-Access-Token': targetAccessToken,
      },
    });
    this.metafieldsOwnerTypes = [
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

    // Lancer l'exécution immédiatement
    this.init();
  }

  async init() {
    try {
      this.logMessage('start', 'Démarrage de la migration...');
      this.metafieldDefinitions = await this.getAllMetafieldDefinitions();
      this.metaobjectDefinitions = await this.getAllMetaobjectDefinitions();

      // Créer les metafield definitions dans la boutique cible
      await this.duplicateMetafieldDefinitions();

      // Créer les metaobject definitions dans la boutique cible
      /* await this.duplicateMetaobjectDefinitions(); */

    } catch (error) {
      this.logMessage('error', `Erreur lors de l'initialisation: ${error.message}`);
    }
  }
  logMessage(type, message) {
    console.log(`[${type}] ${message}`);
  }
  async getAllMetafieldDefinitions() {
    let allDefinitions = [];
    this.logMessage('info', 'Début de la récupération des définitions de metafields...');
    
    for (const ownerType of this.metafieldsOwnerTypes) {
      let definitions = [];
      let hasNextPage = true;
      let cursor = null;
      this.logMessage('info', `Traitement des metafields pour le type: ${ownerType}`);
  
      while (hasNextPage) {
        const response = await this.sourceClient.request(GET_METAFIELD_DEFINITIONS, { 
          after: cursor,
          ownerType: ownerType 
        });
        const newDefinitions = response.metafieldDefinitions.edges.map(edge => edge.node);
        definitions = definitions.concat(newDefinitions);
        this.logMessage('success', `${newDefinitions.length} définitions récupérées pour ${ownerType}`);
        
        hasNextPage = response.metafieldDefinitions.pageInfo.hasNextPage;
        cursor = response.metafieldDefinitions.pageInfo.endCursor;
      }
  
      this.logMessage('success', `Total pour ${ownerType}: ${definitions.length} définitions`);
      allDefinitions = allDefinitions.concat(definitions);
    }
  
    this.logMessage('info', `Total final: ${allDefinitions.length} définitions de metafields`);
    if (allDefinitions.length > 0) {
      this.logMessage('info', `Exemple de définition: ${JSON.stringify(allDefinitions[0], null, 2)}`);
    }
    return allDefinitions;
  }
  async getAllMetaobjectDefinitions() {
    this.logMessage('info', '\n🚀 Début de la récupération des définitions de metaobjects...');
    let definitions = [];
    let hasNextPage = true;
    let cursor = null;
  
    while (hasNextPage) {
      const response = await this.sourceClient.request(GET_METAOBJECT_DEFINITIONS, { after: cursor });
      const newDefinitions = response.metaobjectDefinitions.edges.map(edge => edge.node);
      definitions = definitions.concat(newDefinitions);
      hasNextPage = response.metaobjectDefinitions.pageInfo.hasNextPage;
      cursor = response.metaobjectDefinitions.pageInfo.endCursor;
    }
  
    this.logMessage('success', `\n🎉 Total: ${definitions.length} définitions de metaobjects`);
    this.logMessage('info', '📝 Liste complète des types:', definitions.map(def => def.type).join(', '));
    return definitions;
  }
  async duplicateMetafieldDefinitions() {
    if (this.metafieldDefinitions.length === 0) {
      this.logMessage('error', 'Aucune définition de metafield sur la boutique source trouvée');
      return;
    }
    try {
      this.logMessage('info', '\n🔄 Début de la duplication des metafield definitions...');
      
      for (const def of this.metafieldDefinitions) {
        if (def.ownerType === 'COLLECTION') {
          this.logMessage('info', `Création de la définition: ${def.namespace}.${def.key} (${def.ownerType})`);
          this.logMessage('info', def);
          // Gestion spéciale pour les types list.collection
          let validations = def.validations || null;
          if (def.type.name.includes('metaobject_reference')) {
            this.logMessage('info', `Type metaobject_reference détecté pour ${def.namespace}.${def.key}`);
            
            const matchingDefinition = this.metaobjectDefinitions.find(metaobj => {
              const fieldKey = def.key.toLowerCase();
              const metaobjectType = metaobj.type.toLowerCase();
              return fieldKey.includes(metaobjectType);
            });

            if (!matchingDefinition) {
              this.logMessage('error', `Aucun metaobject trouvé pour ${def.namespace}.${def.key}`);
              continue;
            }

            // Vérifier si c'est une liste ou une référence simple
            if (def.type.name.includes('list.')) {
              validations = [{
                name: 'metaobject_definition_ids',
                value: JSON.stringify([matchingDefinition.id]) // Pour une liste, on doit envoyer un tableau JSON stringifié
              }];
            } else {
              validations = [{
                name: 'metaobject_definition_id',
                value: matchingDefinition.id // Pour une référence simple, on envoie l'ID directement
              }];
            }

            this.logMessage('info', `Validation configurée pour ${def.namespace}.${def.key}:`, JSON.stringify(validations));
          }
  
          const variables = {
            definition: {
              name: def.name,
              namespace: def.namespace,
              key: def.key,
              description: def.description,
              type: def.type.name,
              ownerType: def.ownerType,
              validations: validations
            }
          };
  
          this.logMessage('info', `Variables pour ${def.namespace}.${def.key}:`);
          this.logMessage('info', JSON.stringify(variables, null, 2));
          
          try {
            const result = await this.targetClient.request(CREATE_METAFIELD_DEFINITION, variables);
            if (result?.metafieldDefinitionCreate?.userErrors?.length > 0) {
              this.logMessage('error', `Erreur pour ${def.namespace}.${def.key}:`);
              result.metafieldDefinitionCreate.userErrors.forEach(error => {
                this.logMessage('error', `- ${error.message}`);
              });
            } else {
              this.logMessage('success', `Définition créée avec succès: ${def.namespace}.${def.key}`);
            }
          } catch (error) {
            this.logMessage('error', `Erreur lors de la création de ${def.namespace}.${def.key}:`);
            this.logMessage('error', error.message);
            if (error.response?.errors) {
              this.logMessage('error', `Erreurs GraphQL: ${JSON.stringify(error.response.errors, null, 2)}`);
            }
          }
        }
      }
    } catch (error) {
      this.logMessage('error', `Erreur globale: ${error.message}`);
    }
  }
}

// Créer une instance de la classe
new ManageMeta(process.env.SOURCE_STORE_NAME, process.env.SOURCE_ACCESS_TOKEN, process.env.TARGET_STORE_NAME, process.env.TARGET_ACCESS_TOKEN, process.env.API_VERSION);