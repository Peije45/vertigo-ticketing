// netlify/functions/get-ticket-details.js
// Récupérer les détails d'un ticket avec ses messages

const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
  
  // Vérifier l'authentification
  const cookies = event.headers.cookie || '';
  const sessionToken = cookies.split(';')
    .find(c => c.trim().startsWith('session='))
    ?.split('=')[1];
  
  if (!sessionToken) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Non authentifié' })
    };
  }
  
  const ticketId = event.queryStringParameters?.ticket_id;
  
  if (!ticketId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'ticket_id manquant' })
    };
  }
  
  try {
    const sql = neon(DATABASE_URL);
    
    // Vérifier la session
    const sessions = await sql`
      SELECT user_id FROM sessions 
      WHERE session_token = ${sessionToken}
        AND expires_at > CURRENT_TIMESTAMP
    `;
    
    if (sessions.length === 0) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Session expirée' })
      };
    }
    
    // Récupérer le ticket
    const tickets = await sql`
      SELECT 
        t.*,
        c.name as category_name,
        c.emoji as category_emoji,
        c.color as category_color,
        u.discord_username as assigned_to_username,
        u.discord_avatar_url as assigned_to_avatar,
        u.discord_global_name as assigned_to_display_name
      FROM tickets t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN users u ON u.id = t.assigned_to_user_id
      WHERE t.id = ${ticketId}
    `;
    
    if (tickets.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Ticket non trouvé' })
      };
    }
    
    const ticket = tickets[0];
    
    // Récupérer les messages du ticket
    const messages = await sql`
      SELECT *
      FROM ticket_messages
      WHERE ticket_id = ${ticketId}
        AND deleted_at IS NULL
      ORDER BY created_at ASC
    `;
    
    const userId = sessions[0].user_id;
    
    // Récupérer le dernier message pour enregistrer le last_read_message_id
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    
    // Marquer le ticket comme lu pour l'utilisateur connecté uniquement
    await sql`
      INSERT INTO ticket_read_status (
        ticket_id,
        user_id,
        last_read_at,
        last_read_message_id,
        updated_at
      ) VALUES (
        ${ticketId},
        ${userId},
        CURRENT_TIMESTAMP,
        ${lastMessage ? lastMessage.discord_message_id : null},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (ticket_id, user_id) 
      DO UPDATE SET
        last_read_at = CURRENT_TIMESTAMP,
        last_read_message_id = ${lastMessage ? lastMessage.discord_message_id : null},
        updated_at = CURRENT_TIMESTAMP
    `;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        ticket,
        messages
      })
    };
    
  } catch (error) {
    console.error('Erreur get-ticket-details:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};
