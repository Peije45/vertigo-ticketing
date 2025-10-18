// netlify/functions/close-vote.js
// Clôturer le vote d'un ticket (verrouillage définitif)

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
    const { ticket_id } = body;
    
    if (!ticket_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'ticket_id requis' })
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
    
    // Vérifier les permissions
    if (!user.can_manage_votes) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Vous n\'avez pas la permission de gérer les votes' })
      };
    }
    
    // Vérifier que le ticket existe et que le vote est activé
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
    
    if (!ticket.voting_enabled) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Le vote n\'est pas activé pour ce ticket' })
      };
    }
    
    if (ticket.voting_closed) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Le vote est déjà clôturé' })
      };
    }
    
    // Récupérer les statistiques finales avant clôture
    const voteStats = await sql`
      SELECT 
        COUNT(*) FILTER (WHERE vote = 'pour') as votes_pour,
        COUNT(*) FILTER (WHERE vote = 'contre') as votes_contre,
        COUNT(*) as total_votes
      FROM ticket_votes
      WHERE ticket_id = ${ticket_id}
    `;
    
    const stats = {
      votes_pour: parseInt(voteStats[0].votes_pour),
      votes_contre: parseInt(voteStats[0].votes_contre),
      total_votes: parseInt(voteStats[0].total_votes)
    };
    
    // Clôturer le vote
    const updatedTickets = await sql`
      UPDATE tickets
      SET 
        voting_closed = true,
        voting_closed_at = CURRENT_TIMESTAMP,
        voting_closed_by_user_id = ${user.id},
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
        new_value,
        comment
      ) VALUES (
        ${ticket_id},
        ${user.id},
        'vote_closed',
        ${JSON.stringify(stats)},
        ${`Vote clôturé - Résultat: ${stats.votes_pour} pour, ${stats.votes_contre} contre`}
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
        stats,
        message: 'Vote clôturé avec succès'
      })
    };
    
  } catch (error) {
    console.error('Erreur close-vote:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};
