// netlify/functions/mark-all-as-read.js
// Marquer tous les tickets comme lus pour l'utilisateur connecté

const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
  
  // Accepter seulement POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Méthode non autorisée' })
    };
  }
  
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
  
  try {
    const sql = neon(DATABASE_URL);
    
    // Récupérer l'utilisateur courant
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
    
    const userId = sessions[0].user_id;
    
    console.log(`📖 Marquage de tous les tickets comme lus pour l'utilisateur ${userId}`);
    
    // Récupérer TOUS les tickets (actifs ET résolus)
    const activeTickets = await sql`
      SELECT id, discord_channel_id
      FROM tickets
      ORDER BY created_at DESC
    `;
    
    console.log(`📋 ${activeTickets.length} tickets à marquer comme lus`);
    
    let ticketsMarkedAsRead = 0;
    
    // Pour chaque ticket actif
    for (const ticket of activeTickets) {
      try {
        // Récupérer le dernier message du ticket
        const lastMessages = await sql`
          SELECT discord_message_id
          FROM ticket_messages
          WHERE ticket_id = ${ticket.id}
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
        `;
        
        const lastMessageId = lastMessages.length > 0 ? lastMessages[0].discord_message_id : null;
        
        // Insérer ou mettre à jour le statut de lecture
        await sql`
          INSERT INTO ticket_read_status (
            ticket_id,
            user_id,
            last_read_at,
            last_read_message_id,
            updated_at
          ) VALUES (
            ${ticket.id},
            ${userId},
            CURRENT_TIMESTAMP,
            ${lastMessageId},
            CURRENT_TIMESTAMP
          )
          ON CONFLICT (ticket_id, user_id) 
          DO UPDATE SET
            last_read_at = CURRENT_TIMESTAMP,
            last_read_message_id = ${lastMessageId},
            updated_at = CURRENT_TIMESTAMP
        `;
        
        ticketsMarkedAsRead++;
        
      } catch (error) {
        console.error(`❌ Erreur marquage ticket ${ticket.id}:`, error.message);
      }
    }
    
    console.log(`✅ ${ticketsMarkedAsRead} tickets marqués comme lus`);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        success: true,
        tickets_marked: ticketsMarkedAsRead,
        message: `${ticketsMarkedAsRead} ticket${ticketsMarkedAsRead > 1 ? 's' : ''} marqué${ticketsMarkedAsRead > 1 ? 's' : ''} comme lu${ticketsMarkedAsRead > 1 ? 's' : ''}`
      })
    };
    
  } catch (error) {
    console.error('Erreur mark-all-as-read:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};
