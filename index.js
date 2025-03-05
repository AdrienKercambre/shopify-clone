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

const UPDATE_METAFIELD_DEFINITION = `
  mutation UpdateMetafieldDefinition($id: ID!, $definition: MetafieldDefinitionInput!) {
    metafieldDefinitionUpdate(id: $id, definition: $definition) {
      updatedDefinition {
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
          id
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
      this.sourceMetafieldDefinitions = await this.getAllMetafieldDefinitions(this.sourceClient);
      this.sourceMetaobjectDefinitions = await this.getAllMetaobjectDefinitions(this.sourceClient);

      this.targetMetafieldDefinitions = [];
      this.targetMetaobjectDefinitions = [];


      // Créer les metaobject definitions dans la boutique cible
      //await this.duplicateMetaobjectDefinitions();
      // Créer les metafield definitions dans la boutique cible
      await this.duplicateMetafieldDefinitions();

    } catch (error) {
      this.logMessage('error', `Erreur lors de l'initialisation: ${error.message}`);
    }
  }
  logMessage(type, message) {
    console.log(`[${type}] ${message}`);
  }
  async getAllMetafieldDefinitions(source) {
    let allDefinitions = [];
    this.logMessage('info', 'Début de la récupération des définitions de metafields...');
    
    for (const ownerType of this.metafieldsOwnerTypes) {
      let definitions = [];
      let hasNextPage = true;
      let cursor = null;
      this.logMessage('info', `Traitement des metafields pour le type: ${ownerType}`);
  
      while (hasNextPage) {
        const response = await source.request(GET_METAFIELD_DEFINITIONS, { 
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
  async getAllMetaobjectDefinitions(source) {
    this.logMessage('info', '\n🚀 Début de la récupération des définitions de metaobjects...');
    let definitions = [];
    let hasNextPage = true;
    let cursor = null;
  
    while (hasNextPage) {
      const response = await source.request(GET_METAOBJECT_DEFINITIONS, { after: cursor });
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
    this.logMessage('info', 'Début de la duplication des metafield definitions...');
    try {
      if (!this.sourceMetafieldDefinitions?.length) {
        this.logMessage('error', 'Aucune définition de metafield sur la boutique source trouvée');
        return;
      }
      this.targetMetafieldDefinitions = await this.getAllMetafieldDefinitions(this.targetClient);
      for (const defMetafield of this.sourceMetafieldDefinitions.filter(def => def.ownerType === 'COLLECTION')) {
        if(this.targetMetafieldDefinitions.find(def => def.namespace === defMetafield.namespace && def.key === defMetafield.key)) {
          this.logMessage('info', `Le metafield ${defMetafield.namespace}.${defMetafield.key} existe déjà dans la boutique cible donc on l'update`);
          await this.updateMetafieldDefinition(defMetafield);
        } else {
          this.logMessage('info', `Le metafield ${defMetafield.namespace}.${defMetafield.key} n'existe pas dans la boutique cible donc on le crée`);
          await this.createMetafieldDefinition(defMetafield);
        }
      }
    } catch (error) {
      this.logMessage('error', `Erreur globale: ${error.message}`);
    }
  }

  async createMetafieldDefinition(def) {
    try {
      this.logMessage('info', `Création de la définition du metafield: ${def.namespace}.${def.key} (${def.ownerType})`);
      
      const validations = await this.getMetafieldValidations(def);
      const variables = this.buildMetafieldVariables(def, validations);
      
      await this.sendMetafieldCreationRequest(variables, def);
    } catch (error) {
      this.logMessage('error', `Erreur pour la création du metafield ${def.namespace}.${def.key}: ${error.message}`);
    }
  }

  async updateMetafieldDefinition(def) {
    try { 
      this.logMessage('info', `Mise à jour de la définition du metafield: ${def.namespace}.${def.key} (${def.ownerType})`);
      const validations = await this.getMetafieldValidations(def);
      const variables = this.buildMetafieldVariables(def, validations);
      await this.sendMetafieldUpdateRequest(variables, def);
    } catch (error) {
      this.logMessage('error', `Erreur pour l'update du metafield ${def.namespace}.${def.key}: ${error.message}`);
    }
  }

  async getMetafieldValidations(def) {
    let validations = def.validations || null;

    if (def.type.name.includes('metaobject_reference')) {
      this.logMessage('info', `Type metaobject_reference détecté pour ${def.namespace}.${def.key}`);
      
      const matchingDefinition = this.findMatchingMetaobjectForMetafield(def);
      if (!matchingDefinition) {
        throw new Error(`Aucun metaobject trouvé pour ${def.namespace}.${def.key}`);
      }

      validations = [{
        name: 'metaobject_definition_id',
        value: matchingDefinition.id
      }];

      this.logMessage('info', `Validation configurée pour ${def.namespace}.${def.key}: ${JSON.stringify(validations)}`);
    }

    return validations;
  }

  findMatchingMetaobjectForMetafield(def) {
    return this.targetMetaobjectDefinitions.find(metaobj => {
      const fieldKey = def.key.toLowerCase();
      const metaobjectType = metaobj.type.toLowerCase();
      return fieldKey.includes(metaobjectType);
    });
  }

  buildMetafieldVariables(def, validations) {
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

    this.logMessage('info', `Variables pour ${def.namespace}.${def.key}: ${JSON.stringify(variables, null, 2)}`);
    return variables;
  }

  async sendMetafieldCreationRequest(variables, def) {
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
      if (error.response?.errors) {
        this.logMessage('error', `Erreurs GraphQL: ${JSON.stringify(error.response.errors, null, 2)}`);
      }
      throw error;
    }
  }

  async sendMetafieldUpdateRequest(variables, def) {
    try {
      const result = await this.targetClient.request(UPDATE_METAFIELD_DEFINITION, variables);
      
      if (result?.metafieldDefinitionUpdate?.userErrors?.length > 0) {
        this.logMessage('error', `Erreur pour ${def.namespace}.${def.key}:`);
        result.metafieldDefinitionUpdate.userErrors.forEach(error => {
          this.logMessage('error', `- ${error.message}`);
        });
      } else {
        this.logMessage('success', `Définition mise à jour avec succès: ${def.namespace}.${def.key}`);
      }
    } catch (error) {
      if (error.response?.errors) {
        this.logMessage('error', `Erreurs GraphQL: ${JSON.stringify(error.response.errors, null, 2)}`);
      }
      throw error;
    }
  }

  async duplicateMetaobjectDefinitions() {
    try {
      this.logMessage('info', 'Début de la duplication des metaobject definitions');
      
      // 1. Créer les structures de base des metaobjects
      await this.createBaseMetaobjects();
      // 2. Récupérer les IDs des metaobjects créés
      this.targetMetaobjectDefinitions = await this.getAllMetaobjectDefinitions(this.targetClient);
      
      // 3. Ajouter les champs aux metaobjects
      await this.addFieldsToMetaobjects();
      
    } catch (error) {
      this.logMessage('error', `Erreur globale: ${error.message}`);
    }
  }

  async createBaseMetaobjects() {
    for (const def of this.sourceMetaobjectDefinitions) {
      try {
        const variables = {
          definition: {
            name: def.name,
            type: def.type,
            description: def.description,
            access: { storefront: "PUBLIC_READ" },
            capabilities: { publishable: { enabled: true } },
            fieldDefinitions: []
          }
        };
        
        const result = await this.targetClient.request(CREATE_METAOBJECT_DEFINITION, variables);
        if (result.metaobjectDefinitionCreate.userErrors.length > 0) {
          const errors = result.metaobjectDefinitionCreate.userErrors;
          if (!errors.some(e => e.message === 'Type has already been taken')) {
            this.logMessage('warning', `Erreurs pour ${def.type}: ${JSON.stringify(errors)}`);
          }
        } else {
          this.logMessage('success', `Structure créée: ${def.type}`);
        }
      } catch (error) {
        this.logMessage('error', `Erreur lors de la création de ${def.type}: ${error.message}`);
      }
    }
  }

  async addFieldsToMetaobjects() {
    for (const sourceDef of this.sourceMetaobjectDefinitions) {
      try {
        // On ne gère que les metaobjects de type 'sale' pour le moment
        if (sourceDef.type !== 'sale') {
          continue;
        }
        const targetDef = this.targetMetaobjectDefinitions.find(targetDef => targetDef.type === sourceDef.type);
        if (!targetDef.id) {
          this.logMessage('warning', `Pas d'ID trouvé pour ${targetDef.type}`);
          continue;
        }
        this.logMessage('info', `--------------------------------`);
        this.logMessage('info', `Nous allons ajouter les champs au metaobjet ${targetDef.type}: ${targetDef.id}`);
        this.logMessage('info', `--------------------------------`);

        const fieldDefinitions = sourceDef.fieldDefinitions.map(field => 
          this.createFieldDefinition(field)
        ).filter(Boolean); // Filtrer les champs null/undefined

        //console.log("Champs à ajouter : ", fieldDefinitions);
        await this.updateMetaobjectFields(targetDef.id, fieldDefinitions);
        
      } catch (error) {
        this.logMessage('error', `Erreur pour ${sourceDef.type}: ${error.message}`);
      }
    }
  }

  createFieldDefinition(field) {
    try {
      this.logMessage('info', `Création de la définition pour le champ: ${field.key}`);
      this.logMessage('info', `Type du champ: ${field.type.name}`);

      const baseDefinition = {
        name: field.name,
        key: field.key,
        description: field.description,
        type: field.type.name,
        required: field.required
      };

      if (field.type.name.includes('metaobject_reference')) {
        this.logMessage('info', `Configuration d'une référence metaobject pour ${field.key}`);
        this.logMessage('info', `Recherche d'une correspondance pour la clé: ${field.key}`);
        
        // Log des metaobjects disponibles
        this.logMessage('info', 'Metaobjects disponibles:');
        this.targetMetaobjectDefinitions.forEach(def => {
          this.logMessage('info', `- Type: ${def.type}, ID: ${def.id}`);
        });

        const matchingDefinition = this.findMatchingMetaobject(field.key);
        this.logMessage('info', `Résultat de la recherche: ${
          matchingDefinition 
            ? `Trouvé - Type: ${matchingDefinition.type}, ID: ${matchingDefinition.id}` 
            : 'Aucune correspondance trouvée'
        }`);

        if (!matchingDefinition) {
          this.logMessage('warning', `Pas de metaobject trouvé pour ${field.key}`);
          return null;
        }

        const validations = [{
          name: 'metaobject_definition_id',
          value: matchingDefinition.id
        }];

        this.logMessage('info', `Validations configurées: ${JSON.stringify(validations, null, 2)}`);

        return {
          create: {
            ...baseDefinition,
            validations
          }
        };
      }

      return {
        create: {
          ...baseDefinition,
          validations: field.validations || []
        }
      };
    } catch (error) {
      this.logMessage('error', `Erreur création définition champ ${field.key}: ${error.message}`);
      this.logMessage('error', `Stack trace: ${error.stack}`);
      return null;
    }
  }

  findMatchingMetaobject(fieldKey) {
    return this.targetMetaobjectDefinitions.find(metaobj => {
      const key = fieldKey.toLowerCase();
      const type = metaobj.type.toLowerCase();
      return key === type || 
             key === `${type}s` || 
             key.slice(0, -1) === type || 
             `${key}s` === type;
    });
  }

  updateValidations(fieldsToCreate) {
    return fieldsToCreate.map(field => {
      if (field.create.validations?.some(v => v.name === 'metaobject_definition_id')) {
        const matchingDefinition = this.findMatchingMetaobject(field.create.key);
        if (!matchingDefinition) {
          this.logMessage('warning', `Pas de metaobject trouvé pour ${field.create.key}`);
          return null;
        }
        field.create.validations = [{ name: 'metaobject_definition_id', value: matchingDefinition.id }];
      }
      return field;
    });
  }
  async updateMetaobjectFields(definitionId, fieldDefinitions) {
    try {
      this.logMessage('info', `\n=== DÉBUT DE LA MISE À JOUR DES CHAMPS ===`);
      this.logMessage('info', `ID de définition: ${definitionId}`);
      this.logMessage('info', `Nombre de champs reçus: ${fieldDefinitions.length}`);
      
      // 1. Récupération des champs existants
      this.logMessage('info', `\n1. RÉCUPÉRATION DES CHAMPS EXISTANTS`);
      const existingFields = await this.getExistingFields(definitionId);
      this.logMessage('info', `Champs existants: ${JSON.stringify(existingFields, null, 2)}`);
      
      // 2. Séparation des champs
      this.logMessage('info', `\n2. SÉPARATION DES CHAMPS`);
      const { fieldsToCreate, fieldsToUpdate } = this.separateFields(fieldDefinitions, existingFields);
      this.logMessage('info', `Nombre de champs à créer: ${fieldsToCreate.length}`);
      this.logMessage('info', `Nombre de champs à mettre à jour: ${fieldsToUpdate.length}`);
      
      // 3. Récupération des metaobjects de la cible
      this.logMessage('info', `\n3. RÉCUPÉRATION DES METAOBJECTS CIBLES`);
      const targetMetaobjectsResponse = await this.targetClient.request(GET_METAOBJECT_DEFINITIONS_IDS);
      const targetMetaobjects = targetMetaobjectsResponse.metaobjectDefinitions.edges;
      this.logMessage('info', `Metaobjects cibles disponibles:`);
      targetMetaobjects.forEach(edge => {
        this.logMessage('info', `- Type: ${edge.node.type}, ID: ${edge.node.id}`);
      });
      
      // 4. Mise à jour des IDs dans les validations
      this.logMessage('info', `\n4. MISE À JOUR DES VALIDATIONS`);
      
      // Pour les champs à créer
      this.logMessage('info', `\n4.1 TRAITEMENT DES CHAMPS À CRÉER`);
      const updatedFieldsToCreate = fieldsToCreate.map(field => {
        this.logMessage('info', `\nTraitement du champ: ${field.create.key}`);
        this.logMessage('info', `Type: ${field.create.type}`);
        this.logMessage('info', `Validations actuelles: ${JSON.stringify(field.create.validations, null, 2)}`);
        
        if (field.create.validations?.some(v => 
          v.name === 'metaobject_definition_id' || 
          v.name === 'metaobject_definition_ids'
        )) {
          this.logMessage('info', `Le champ a des validations de type metaobject`);
          
          const matchingTargetMetaobject = targetMetaobjects.find(edge => {
            const fieldKey = field.create.key.toLowerCase();
            const metaobjectType = edge.node.type.toLowerCase();
            const isMatch = fieldKey === metaobjectType || 
                   fieldKey === `${metaobjectType}s` || 
                   fieldKey.slice(0, -1) === metaobjectType || 
                   `${fieldKey}s` === metaobjectType;
            this.logMessage('info', `Comparaison: ${fieldKey} avec ${metaobjectType} => ${isMatch}`);
            return isMatch;
          });

          if (matchingTargetMetaobject) {
            this.logMessage('info', `Correspondance trouvée: ${matchingTargetMetaobject.node.type}`);
            field.create.validations = field.create.validations.map(v => {
              if (v.name === 'metaobject_definition_id' || v.name === 'metaobject_definition_ids') {
                const newValidation = {
                  name: v.name,
                  value: v.name === 'metaobject_definition_ids' 
                    ? JSON.stringify([matchingTargetMetaobject.node.id])
                    : matchingTargetMetaobject.node.id
                };
                this.logMessage('info', `Nouvelle validation: ${JSON.stringify(newValidation, null, 2)}`);
                return newValidation;
              }
              return v;
            });
          } else {
            this.logMessage('warning', `Aucune correspondance trouvée pour ${field.create.key}`);
          }
        }
        return field;
      });

      // Pour les champs à mettre à jour
      this.logMessage('info', `\n4.2 TRAITEMENT DES CHAMPS À METTRE À JOUR`);
      const updatedFieldsToUpdate = fieldsToUpdate.map(field => {
        this.logMessage('info', `\nTraitement du champ existant: ${field.create.key}`);
        this.logMessage('info', `Type: ${field.create.type}`);
        this.logMessage('info', `Validations actuelles: ${JSON.stringify(field.create.validations, null, 2)}`);

        // Si le champ a des validations de type metaobject
        if (field.create.validations?.some(v => 
          v.name === 'metaobject_definition_id' || 
          v.name === 'metaobject_definition_ids'
        )) {
          this.logMessage('info', `Le champ a des validations de type metaobject`);
          
          const matchingTargetMetaobject = targetMetaobjects.find(edge => {
            const fieldKey = field.create.key.toLowerCase();
            const metaobjectType = edge.node.type.toLowerCase();
            const isMatch = fieldKey === metaobjectType || 
                   fieldKey === `${metaobjectType}s` || 
                   fieldKey.slice(0, -1) === metaobjectType || 
                   `${fieldKey}s` === metaobjectType;
            this.logMessage('info', `Comparaison: ${fieldKey} avec ${metaobjectType} => ${isMatch}`);
            return isMatch;
          });

          if (matchingTargetMetaobject) {
            this.logMessage('info', `Correspondance trouvée: ${matchingTargetMetaobject.node.type}`);
            field.create.validations = field.create.validations.map(v => {
              if (v.name === 'metaobject_definition_id' || v.name === 'metaobject_definition_ids') {
                const newValidation = {
                  name: v.name,
                  value: v.name === 'metaobject_definition_ids' 
                    ? JSON.stringify([matchingTargetMetaobject.node.id])
                    : matchingTargetMetaobject.node.id
                };
                this.logMessage('info', `Nouvelle validation: ${JSON.stringify(newValidation, null, 2)}`);
                return newValidation;
              }
              return v;
            });
          } else {
            this.logMessage('warning', `Aucune correspondance trouvée pour ${field.create.key}`);
          }
        }
        return field;
      });

      // 5. Construction des variables
      this.logMessage('info', `\n5. CONSTRUCTION DES VARIABLES FINALES`);
      const variables = {
        id: definitionId,
        definition: {
          fieldDefinitions: [
            ...updatedFieldsToCreate.map(field => {
              this.logMessage('info', `Champ à créer: ${field.create.key}`);
              return { create: field.create };
            }),
            ...updatedFieldsToUpdate.map(field => {
              this.logMessage('info', `Champ à mettre à jour: ${field.create.key}`);
              return {
                update: {
                  key: field.create.key,
                  description: field.create.description,
                  required: field.create.required,
                  validations: field.create.validations
                }
              };
            })
          ]
        }
      };

      this.logMessage('info', `\n6. ENVOI À L'API`);
      this.logMessage('info', `Variables finales: ${JSON.stringify(variables, null, 2)}`);

      const result = await this.targetClient.request(UPDATE_METAOBJECT_DEFINITION, variables);

      if (result.metaobjectDefinitionUpdate.userErrors.length > 0) {
        this.logMessage('warning', `\n❌ ERREURS DÉTECTÉES`);
        for (const error of result.metaobjectDefinitionUpdate.userErrors) {
          this.logMessage('warning', `Erreur: ${error.message}`);
          this.logMessage('warning', `Champ en erreur: ${error.field}`);
          this.logMessage('warning', `Code d'erreur: ${error.code}`);
        }
      } else {
        this.logMessage('success', `\n✅ Mise à jour réussie`);
      }
    } catch (error) {
      this.logMessage('error', `\n❌ ERREUR GLOBALE: ${error.message}`);
      if (error.response?.errors) {
        this.logMessage('error', `Erreurs GraphQL: ${JSON.stringify(error.response.errors, null, 2)}`);
      }
    }
  }

  async getExistingFields(definitionId) {
    // Requête pour obtenir les champs existants
    const GET_EXISTING_FIELDS = `
      query GetMetaobjectDefinition($id: ID!) {
        metaobjectDefinition(id: $id) {
          fieldDefinitions {
            key
          }
        }
      }
    `;
    
    const response = await this.targetClient.request(GET_EXISTING_FIELDS, { id: definitionId });
    return response.metaobjectDefinition.fieldDefinitions.map(field => field.key);
  }

  separateFields(fieldDefinitions, existingFields) {
    const fieldsToCreate = [];
    const fieldsToUpdate = [];

    fieldDefinitions.forEach(field => {
      if (existingFields.includes(field.create.key)) {
        fieldsToUpdate.push(field);
      } else {
        fieldsToCreate.push(field);
      }
    });

    return { fieldsToCreate, fieldsToUpdate };
  }
}

// Créer une instance de la classe
new ManageMeta(process.env.SOURCE_STORE_NAME, process.env.SOURCE_ACCESS_TOKEN, process.env.TARGET_STORE_NAME, process.env.TARGET_ACCESS_TOKEN, process.env.API_VERSION);