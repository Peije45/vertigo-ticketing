// netlify/functions/sync-tickettool-v2.js
// Synchroniser les tickets par catégories Discord - VERSION AVEC CORS

const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  // ✅ Headers CORS pour permettre les appels externes
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
    
    if (body.admin_secret !== ADMIN_SECRET) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Secret invalide' })
      };
    }
    
    const { 
      guild_id = '1288511254369013831',
      category_mappings // Objet qui mappe ID catégorie Discord → Nom catégorie BDD
    } = body;
    
    if (!category_mappings || Object.keys(category_mappings).length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'category_mappings requis',
          example: {
            "1291802650697793608": "Questions",
            "CATEGORY_ID_CLAIM": "Claim",
            "CATEGORY_ID_PARRAINAGE": "Parrainage"
          }
        })
      };
    }
    
    const sql = neon(DATABASE_URL);
    
    // Récupérer tous les channels du serveur
    const channelsResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guild_id}/channels`,
      {
        headers: {
          'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!channelsResponse.ok) {
      const errorText = await channelsResponse.text();
      console.error('Erreur Discord API:', channelsResponse.status, errorText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Erreur récupération channels Discord',
          status: channelsResponse.status,
          details: errorText
        })
      };
    }
    
    const allChannels = await channelsResponse.json();
    
    // Filtrer uniquement les channels dans les catégories de ticketing
    const categoryIds = Object.keys(category_mappings);
    const ticketChannels = allChannels.filter(ch => 
      ch.parent_id && categoryIds.includes(ch.parent_id)
    );
    
    console.log(`Trouvé ${ticketChannels.length} tickets dans ${categoryIds.length} catégories`);
    
    const results = {
      success: [],
      errors: []
    };
    
    // Traiter chaque ticket
    for (const channel of ticketChannels) {
      try {
        // Récupérer le nom de la catégorie BDD depuis le mapping
        const categoryName = category_mappings[channel.parent_id];
        
        // Trouver l'ID de la catégorie dans la BDD
        const categories = await sql`
          SELECT id FROM categories 
          WHERE name ILIKE ${categoryName}
          LIMIT 1
        `;
        const category_id = categories.length > 0 ? categories[0].id : null;
        
        // Récupérer les messages du channel
        const messagesResponse = await fetch(
          `https://discord.com/api/v10/channels/${channel.id}/messages?limit=100`,
          {
            headers: {
              'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const messages = messagesResponse.ok ? await messagesResponse.json() : [];
        
        // Trouver le créateur (premier message non-bot)
        let creator = null;
        if (messages.length > 0) {
          const firstUserMessage = messages.reverse().find(m => !m.author.bot);
          if (firstUserMessage) {
            creator = firstUserMessage.author;
          }
        }
        
        // Parser le nom pour voir si quelqu'un a claim
        const ticketInfo = parseTicketName(channel.name);
        
        // Trouver l'utilisateur staff assigné
        let assignedUserId = null;
        if (ticketInfo.staffName) {
          const staffUsers = await sql`
            SELECT id FROM users 
            WHERE LOWER(discord_username) = LOWER(${ticketInfo.staffName})
               OR LOWER(discord_global_name) = LOWER(${ticketInfo.staffName})
            LIMIT 1
          `;
          
          if (staffUsers.length > 0) {
            assignedUserId = staffUsers[0].id;
          }
        }
        
        // Déterminer le statut
        const status = assignedUserId ? 'en_cours' : 'nouveau';
        
        // Priorité par défaut
        const priority = categoryName === 'Claim' || categoryName === 'Bugs' ? 'haute' : 'moyenne';
        
        // Date de création (à partir du snowflake Discord)
        const createdAt = new Date((parseInt(channel.id) / 4194304) + 1420070400000).toISOString();
        
        // Insérer le ticket
        const ticketResult = await sql`
          INSERT INTO tickets (
            discord_channel_id,
            discord_server_id,
            title,
            category_id,
            status,
            priority,
            created_by_discord_id,
            created_by_username,
            created_by_avatar_url,
            assigned_to_user_id,
            assigned_at,
            is_unread,
            unread_count,
            created_at
          ) VALUES (
            ${channel.id},
            ${guild_id},
            ${channel.name},
            ${category_id},
            ${status},
            ${priority},
            ${creator?.id || 'unknown'},
            ${ticketInfo.username || creator?.username || 'Utilisateur inconnu'},
            ${creator?.avatar ? `https://cdn.discordapp.com/avatars/${creator.id}/${creator.avatar}.png` : null},
            ${assignedUserId},
            ${assignedUserId ? new Date().toISOString() : null},
            true,
            ${messages.length},
            ${createdAt}
          )
          ON CONFLICT (discord_channel_id) DO UPDATE SET
            title = EXCLUDED.title,
            status = EXCLUDED.status,
            assigned_to_user_id = EXCLUDED.assigned_to_user_id,
            category_id = EXCLUDED.category_id,
            unread_count = EXCLUDED.unread_count,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `;
        
        const ticketId = ticketResult[0].id;
        
        // Insérer les messages
        let messageCount = 0;
        for (const msg of messages) {
          if (msg.content && !msg.author.bot) {
            try {
              await sql`
                INSERT INTO ticket_messages (
                  ticket_id,
                  discord_message_id,
                  author_discord_id,
                  author_username,
                  author_avatar_url,
                  content,
                  is_from_staff,
                  created_at
                ) VALUES (
                  ${ticketId},
                  ${msg.id},
                  ${msg.author.id},
                  ${msg.author.username},
                  ${msg.author.avatar ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png` : null},
                  ${msg.content.substring(0, 2000)},
                  false,
                  ${new Date(msg.timestamp).toISOString()}
                )
                ON CONFLICT (discord_message_id) DO NOTHING
              `;
              messageCount++;
            } catch (err) {
              console.log('Erreur insertion message:', err.message);
            }
          }
        }
        
        results.success.push({
          channel_id: channel.id,
          ticket_id: ticketId,
          title: channel.name,
          status: status,
          category: categoryName,
          messages: messageCount
        });
        
      } catch (error) {
        console.error('Erreur channel:', channel.id, error);
        results.errors.push({
          channel_id: channel.id,
          name: channel.name,
          error: error.message
        });
      }
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Synchronisation terminée',
        total_tickets: ticketChannels.length,
        imported: results.success.length,
        failed: results.errors.length,
        results
      })
    };
    
  } catch (error) {
    console.error('Erreur sync:', error);
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

// Parser le nom du ticket
function parseTicketName(name) {
  const parts = name.split('-');
  
  if (parts.length === 2) {
    return {
      number: parts[0],
      username: parts[1],
      staffName: null
    };
  } else if (parts.length >= 3) {
    return {
      number: parts[0],
      staffName: parts[1],
      username: parts.slice(2).join('-')
    };
  }
  
  return {
    number: null,
    username: name,
    staffName: null
  };
}
