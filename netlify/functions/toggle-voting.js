// netlify/functions/toggle-voting.js
// Activer ou désactiver le vote pour un ticket

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
    const { ticket_id, enable } = body;
    
    if (!ticket_id || typeof enable !== 'boolean') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'ticket_id et enable (boolean) requis' })
      };
    }
    
    const sql = neon(DATABASE_URL);
    
    // Vérifier la session et les permissions
    const sessions = await sql`
      SELECT u.id, u.can_manage_votes
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.session_token = ${sessionToken}
        AND s.expires_at > CURRENT_TIMESTAMP
    `;
    
    if (sessions.length === 0) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Session expirée' })
      };
    }
    
    const user = sessions[0];
    
    // Vérifier les permissions (pour le moment tout le monde peut, mais la colonne est prête)
    if (!user.can_manage_votes) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Vous n\'avez pas la permission de gérer les votes' })
      };
    }
    
    // Vérifier que le ticket existe
    const tickets = await sql`
      SELECT id, voting_enabled, voting_closed
      FROM tickets
      WHERE id = ${ticket_id}
    `;
    
    if (tickets.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Ticket non trouvé' })
      };
    }
    
    const ticket = tickets[0];
    
    // Si on désactive le vote, réinitialiser aussi voting_closed
    const updates = enable 
      ? { voting_enabled: true }
      : { voting_enabled: false, voting_closed: false, voting_closed_at: null, voting_closed_by_user_id: null };
    
    // Mettre à jour le ticket
    const updatedTickets = await sql`
      UPDATE tickets
      SET 
        voting_enabled = ${updates.voting_enabled},
        voting_closed = ${updates.voting_closed || false},
        voting_closed_at = ${updates.voting_closed_at || null},
        voting_closed_by_user_id = ${updates.voting_closed_by_user_id || null},
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
        ${user.id},
        'voting_toggled',
        ${ticket.voting_enabled.toString()},
        ${enable.toString()},
        ${enable ? 'Vote activé pour ce ticket' : 'Vote désactivé pour ce ticket'}
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
        message: enable ? 'Vote activé avec succès' : 'Vote désactivé avec succès'
      })
    };
    
  } catch (error) {
    console.error('Erreur toggle-voting:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};
