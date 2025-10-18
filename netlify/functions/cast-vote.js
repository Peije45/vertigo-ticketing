// netlify/functions/cast-vote.js
// Voter pour ou contre un ticket (avec modification possible)

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
    const { ticket_id, vote } = body;
    
    // Validation
    if (!ticket_id || !vote) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'ticket_id et vote requis' })
      };
    }
    
    if (vote !== 'pour' && vote !== 'contre') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'vote doit être "pour" ou "contre"' })
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
        body: JSON.stringify({ error: 'Le vote est clôturé pour ce ticket' })
      };
    }
    
    // Vérifier si l'utilisateur a déjà voté
    const existingVotes = await sql`
      SELECT id, vote
      FROM ticket_votes
      WHERE ticket_id = ${ticket_id}
        AND user_id = ${userId}
    `;
    
    let result;
    let message;
    let isUpdate = false;
    
    if (existingVotes.length > 0) {
      // L'utilisateur a déjà voté - mise à jour
      const oldVote = existingVotes[0].vote;
      
      if (oldVote === vote) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            message: `Vous avez déjà voté ${vote}`,
            vote_unchanged: true
          })
        };
      }
      
      // Mettre à jour le vote
      result = await sql`
        UPDATE ticket_votes
        SET 
          vote = ${vote},
          updated_at = CURRENT_TIMESTAMP
        WHERE ticket_id = ${ticket_id}
          AND user_id = ${userId}
        RETURNING *
      `;
      
      message = `Vote modifié de "${oldVote}" vers "${vote}"`;
      isUpdate = true;
      
      // Logger la modification
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
          'vote_changed',
          ${oldVote},
          ${vote},
          'Vote modifié'
        )
      `;
      
    } else {
      // Nouveau vote
      result = await sql`
        INSERT INTO ticket_votes (
          ticket_id,
          user_id,
          vote
        ) VALUES (
          ${ticket_id},
          ${userId},
          ${vote}
        )
        RETURNING *
      `;
      
      message = `Vote "${vote}" enregistré`;
      
      // Logger le nouveau vote
      await sql`
        INSERT INTO ticket_activity_log (
          ticket_id,
          user_id,
          action_type,
          new_value,
          comment
        ) VALUES (
          ${ticket_id},
          ${userId},
          'vote_cast',
          ${vote},
          'Nouveau vote'
        )
      `;
    }
    
    // Récupérer les statistiques de vote mises à jour
    const voteStats = await sql`
      SELECT 
        COUNT(*) FILTER (WHERE vote = 'pour') as votes_pour,
        COUNT(*) FILTER (WHERE vote = 'contre') as votes_contre,
        COUNT(*) as total_votes
      FROM ticket_votes
      WHERE ticket_id = ${ticket_id}
    `;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        success: true,
        message,
        vote: result[0],
        is_update: isUpdate,
        stats: {
          votes_pour: parseInt(voteStats[0].votes_pour),
          votes_contre: parseInt(voteStats[0].votes_contre),
          total_votes: parseInt(voteStats[0].total_votes)
        }
      })
    };
    
  } catch (error) {
    console.error('Erreur cast-vote:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};
