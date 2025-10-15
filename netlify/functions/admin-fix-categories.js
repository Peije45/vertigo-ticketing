// netlify/functions/admin-fix-categories.js
// ✅ Fonction one-shot pour corriger les catégories de TOUS les tickets existants
// Vérifie chaque ticket Discord et met à jour sa catégorie en BDD si elle a changé

const { neon } = require('@neondatabase/serverless');

// Mapping des catégories Discord → Noms en BDD
const CATEGORY_MAPPINGS = {
  "1291802650697793608": "Claim",
  "1385590330660884530": "Parrainage",
  "1385592028754087996": "RP",
  "1385591177138671737": "Dossier",
  "1385592373886844948": "Bugs",
  "1385592539247153243": "Questions",
  "1427987863189979318": "Wipe",
  "1427989223700435055": "Don"
};

exports.handler = async (event, context) => {
  // ✅ Headers CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  
  // Répondre aux preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Méthode non autorisée' })
    };
  }
  
  try {
    const body = JSON.parse(event.body || '{}');
    
    // Vérifier le secret admin
    if (body.admin_secret !== ADMIN_SECRET) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Secret invalide' })
      };
    }
    
    console.log('🔧 Début de la correction des catégories de tous les tickets...');
    
    const sql = neon(DATABASE_URL);
    
    // Récupérer TOUS les tickets actifs (non résolus)
    const tickets = await sql`
      SELECT 
        id,
        discord_channel_id,
        title,
        category_id
      FROM tickets
      WHERE status != 'resolu'
      ORDER BY created_at DESC
    `;
    
    console.log(`📋 ${tickets.length} tickets à vérifier`);
    
    let categoriesFixed = 0;
    let errors = [];
    
    // Vérifier chaque ticket
    for (const ticket of tickets) {
      try {
        // Récupérer les infos du channel Discord
        const channelResponse = await fetch(
          `https://discord.com/api/v10/channels/${ticket.discord_channel_id}`,
          {
            headers: {
              'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (!channelResponse.ok) {
          console.log(`⚠️ Channel ${ticket.discord_channel_id} inaccessible`);
          errors.push({
            ticket_id: ticket.id,
            channel_id: ticket.discord_channel_id,
            error: 'Channel inaccessible ou supprimé'
          });
          continue;
        }
        
        const channel = await channelResponse.json();
        
        // Vérifier la catégorie Discord actuelle
        const currentCategoryDiscordId = channel.parent_id;
        const currentCategoryName = CATEGORY_MAPPINGS[currentCategoryDiscordId];
        
        if (!currentCategoryName) {
          console.log(`⚠️ Catégorie Discord ${currentCategoryDiscordId} non reconnue pour ticket ${ticket.title}`);
          errors.push({
            ticket_id: ticket.id,
            channel_id: ticket.discord_channel_id,
            error: `Catégorie Discord ${currentCategoryDiscordId} non dans le mapping`
          });
          continue;
        }
        
        // Récupérer l'ID de la catégorie en BDD
        const categories = await sql`
          SELECT id, name FROM categories 
          WHERE name ILIKE ${currentCategoryName}
          LIMIT 1
        `;
        
        if (categories.length === 0) {
          console.log(`⚠️ Catégorie "${currentCategoryName}" non trouvée en BDD`);
          errors.push({
            ticket_id: ticket.id,
            channel_id: ticket.discord_channel_id,
            error: `Catégorie "${currentCategoryName}" non trouvée en BDD`
          });
          continue;
        }
        
        const correctCategoryId = categories[0].id;
        
        // Vérifier si la catégorie est différente
        if (correctCategoryId !== ticket.category_id) {
          console.log(`📂 Correction catégorie pour ticket "${ticket.title}": ${ticket.category_id} → ${correctCategoryId} (${currentCategoryName})`);
          
          // Mettre à jour la catégorie
          await sql`
            UPDATE tickets 
            SET 
              category_id = ${correctCategoryId},
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ${ticket.id}
          `;
          
          // Logger le changement
          await sql`
            INSERT INTO ticket_activity_log (
              ticket_id,
              user_id,
              action_type,
              old_value,
              new_value,
              comment
            ) VALUES (
              ${ticket.id},
              NULL,
              'category_changed',
              ${ticket.category_id},
              ${correctCategoryId},
              ${`Correction manuelle: catégorie changée vers ${currentCategoryName}`}
            )
          `;
          
          categoriesFixed++;
        }
        
      } catch (error) {
        console.error(`❌ Erreur traitement ticket ${ticket.id}:`, error.message);
        errors.push({
          ticket_id: ticket.id,
          channel_id: ticket.discord_channel_id,
          error: error.message
        });
      }
    }
    
    const summary = {
      success: true,
      total_tickets_checked: tickets.length,
      categories_fixed: categoriesFixed,
      errors_count: errors.length,
      errors: errors,
      timestamp: new Date().toISOString()
    };
    
    console.log('✅ Correction terminée:');
    console.log(`   - ${tickets.length} tickets vérifiés`);
    console.log(`   - ${categoriesFixed} catégories corrigées`);
    console.log(`   - ${errors.length} erreurs`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(summary)
    };
    
  } catch (error) {
    console.error('❌ Erreur correction catégories:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message,
        stack: error.stack
      })
    };
  }
};
