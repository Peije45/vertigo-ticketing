// netlify/functions/webhook-discord-ticket.js
// Webhook pour recevoir les événements de tickets depuis Discord

const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
  const WEBHOOK_SECRET = process.env.DISCORD_WEBHOOK_SECRET; // Clé secrète pour sécuriser
  
  // Vérifier que c'est une requête POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Méthode non autorisée' })
    };
  }
  
  try {
    const body = JSON.parse(event.body || '{}');
    
    // Vérifier le secret webhook (sécurité)
    if (body.secret !== WEBHOOK_SECRET) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Secret invalide' })
      };
    }
    
    const { event_type, ticket_data } = body;
    const sql = neon(DATABASE_URL);
    
    // Gestion des différents types d'événements
    switch (event_type) {
      case 'ticket_created':
        await handleTicketCreated(sql, ticket_data);
        break;
      
      case 'ticket_message':
        await handleTicketMessage(sql, ticket_data);
        break;
      
      case 'ticket_closed':
        await handleTicketClosed(sql, ticket_data);
        break;
      
      case 'ticket_claimed':
        await handleTicketClaimed(sql, ticket_data);
        break;
        
      default:
        console.log('Type d\'événement inconnu:', event_type);
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };
    
  } catch (error) {
    console.error('Erreur webhook:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};

// Créer un nouveau ticket
async function handleTicketCreated(sql, data) {
  const {
    discord_channel_id,
    discord_server_id,
    discord_thread_id,
    title,
    category_name,
    priority = 'moyenne',
    created_by_discord_id,
    created_by_username,
    created_by_avatar_url
  } = data;
  
  // Trouver la catégorie par son nom
  const categories = await sql`
    SELECT id FROM categories 
    WHERE name ILIKE ${category_name}
    LIMIT 1
  `;
  
  const category_id = categories.length > 0 ? categories[0].id : null;
  
  // Créer le ticket
  await sql`
    INSERT INTO tickets (
      discord_channel_id,
      discord_server_id,
      discord_thread_id,
      title,
      category_id,
      status,
      priority,
      created_by_discord_id,
      created_by_username,
      created_by_avatar_url,
      is_unread,
      unread_count
    ) VALUES (
      ${discord_channel_id},
      ${discord_server_id},
      ${discord_thread_id || null},
      ${title},
      ${category_id},
      'nouveau',
      ${priority},
      ${created_by_discord_id},
      ${created_by_username},
      ${created_by_avatar_url || null},
      true,
      1
    )
    ON CONFLICT (discord_channel_id) DO UPDATE SET
      title = EXCLUDED.title,
      updated_at = CURRENT_TIMESTAMP
  `;
  
  console.log('Ticket créé:', discord_channel_id);
}

// Ajouter un message à un ticket
async function handleTicketMessage(sql, data) {
  const {
    discord_channel_id,
    discord_message_id,
    author_discord_id,
    author_username,
    author_avatar_url,
    content,
    is_from_staff = false
  } = data;
  
  // Récupérer le ticket
  const tickets = await sql`
    SELECT id FROM tickets 
    WHERE discord_channel_id = ${discord_channel_id}
  `;
  
  if (tickets.length === 0) {
    console.log('Ticket non trouvé pour le message');
    return;
  }
  
  const ticket_id = tickets[0].id;
  
  // Ajouter le message
  await sql`
    INSERT INTO ticket_messages (
      ticket_id,
      discord_message_id,
      author_discord_id,
      author_username,
      author_avatar_url,
      content,
      is_from_staff
    ) VALUES (
      ${ticket_id},
      ${discord_message_id},
      ${author_discord_id},
      ${author_username},
      ${author_avatar_url || null},
      ${content},
      ${is_from_staff}
    )
  `;
  
  // Mettre à jour le ticket (nouveau message)
  await sql`
    UPDATE tickets SET
      unread_count = unread_count + 1,
      has_new_messages = true,
      is_unread = true,
      last_message_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${ticket_id}
  `;
  
  console.log('Message ajouté au ticket:', ticket_id);
}

// Fermer un ticket
async function handleTicketClosed(sql, data) {
  const { discord_channel_id } = data;
  
  await sql`
    UPDATE tickets SET
      status = 'resolu',
      closed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE discord_channel_id = ${discord_channel_id}
  `;
  
  console.log('Ticket fermé:', discord_channel_id);
}

// Assigner un ticket
async function handleTicketClaimed(sql, data) {
  const { discord_channel_id, claimed_by_discord_id } = data;
  
  // Trouver l'utilisateur dans la BDD
  const users = await sql`
    SELECT id FROM users 
    WHERE discord_id = ${claimed_by_discord_id}
  `;
  
  const user_id = users.length > 0 ? users[0].id : null;
  
  if (user_id) {
    await sql`
      UPDATE tickets SET
        assigned_to_user_id = ${user_id},
        assigned_at = CURRENT_TIMESTAMP,
        status = 'en_cours',
        updated_at = CURRENT_TIMESTAMP
      WHERE discord_channel_id = ${discord_channel_id}
    `;
    
    console.log('Ticket assigné à:', user_id);
  }
}
