// netlify/functions/claim-ticket.js
// Assigner (claim) un ticket à un utilisateur

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
    const body = JSON.parse(event.body || '{}');
    const { ticket_id, user_id } = body;
    
    if (!ticket_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'ticket_id manquant' })
      };
    }
    
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
    
    const currentUserId = sessions[0].user_id;
    const targetUserId = user_id || currentUserId; // Si pas de user_id, s'assigner soi-même
    
    // Assigner le ticket
    const updatedTickets = await sql`
      UPDATE tickets 
      SET 
        assigned_to_user_id = ${targetUserId},
        assigned_at = CURRENT_TIMESTAMP,
        assigned_by_user_id = ${currentUserId},
        status = CASE 
          WHEN status = 'nouveau' THEN 'en_cours'
          ELSE status
        END
      WHERE id = ${ticket_id}
      RETURNING *
    `;
    
    if (updatedTickets.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Ticket non trouvé' })
      };
    }
    
    // Logger l'action
    await sql`
      INSERT INTO ticket_activity_log (
        ticket_id,
        user_id,
        action_type,
        new_value,
        comment
      ) VALUES (
        ${ticket_id},
        ${currentUserId},
        'assigned',
        ${targetUserId},
        ${targetUserId === currentUserId ? 'Auto-assigné' : 'Assigné par admin'}
      )
    `;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        success: true,
        ticket: updatedTickets[0]
      })
    };
    
  } catch (error) {
    console.error('Erreur claim-ticket:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};
