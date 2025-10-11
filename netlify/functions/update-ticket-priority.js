// netlify/functions/update-ticket-priority.js
// ✅ Mettre à jour la priorité d'un ticket manuellement
// Permet aux admins d'attribuer ou modifier la priorité d'un ticket

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
    const { ticket_id, priority } = body;
    
    if (!ticket_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'ticket_id manquant' })
      };
    }
    
    // Valider la priorité
    const validPriorities = ['haute', 'moyenne', 'basse', null];
    if (priority !== null && !validPriorities.includes(priority)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Priorité invalide (haute, moyenne, basse ou null)' })
      };
    }
    
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
    
    const userId = sessions[0].user_id;
    
    // Récupérer l'ancienne priorité pour le log
    const oldTickets = await sql`
      SELECT priority FROM tickets WHERE id = ${ticket_id}
    `;
    
    if (oldTickets.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Ticket non trouvé' })
      };
    }
    
    const oldPriority = oldTickets[0].priority;
    
    // Mettre à jour la priorité
    const updatedTickets = await sql`
      UPDATE tickets 
      SET 
        priority = ${priority},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${ticket_id}
      RETURNING *
    `;
    
    // Logger l'action
    await sql`
      INSERT INTO ticket_activity_log (
        ticket_id,
        user_id,
        action_type,
        old_value,
        new_value,
        comment
      ) VALUES (
        ${ticket_id},
        ${userId},
        'priority_changed',
        ${oldPriority},
        ${priority},
        ${priority === null 
          ? 'Priorité retirée' 
          : `Priorité changée de ${oldPriority || 'non définie'} à ${priority}`
        }
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
        ticket: updatedTickets[0],
        message: `Priorité ${priority ? 'mise à jour' : 'retirée'} avec succès`
      })
    };
    
  } catch (error) {
    console.error('Erreur update-ticket-priority:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};
