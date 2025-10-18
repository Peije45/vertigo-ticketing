// netlify/functions/get-archived-tickets.js
// Récupérer les tickets archivés uniquement

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
    
    const userId = sessions[0].user_id;
    
    // Récupérer les paramètres de requête
    const params = event.queryStringParameters || {};
    const {
      category_id,
      search,
      limit = '100',
      offset = '0'
    } = params;
    
    // Construire dynamiquement les conditions WHERE
    const whereConditions = ['t.is_archived = true', 't.status = \'resolu\''];
    const whereParams = [];
    
    // Filtre par catégorie
    if (category_id) {
      whereConditions.push(`t.category_id = $${whereConditions.length + 1}`);
      whereParams.push(parseInt(category_id));
    }
    
    // Filtre par recherche
    if (search && search.length > 0) {
      whereConditions.push(`(
        LOWER(t.title) LIKE $${whereConditions.length + 1} 
        OR LOWER(t.created_by_username) LIKE $${whereConditions.length + 1}
      )`);
      whereParams.push(`%${search.toLowerCase()}%`);
    }
    
    // Construire la clause WHERE
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';
    
    // Requête SQL pour récupérer les tickets archivés
    const query = `
     SELECT 
        t.*,
        c.name as category_name,
        c.emoji as category_emoji,
        c.color as category_color,
        u.discord_username as assigned_to_username,
        u.discord_avatar_url as assigned_to_avatar,
        u.discord_global_name as assigned_to_display_name,
        -- Données de vote
        (SELECT COUNT(*) FROM ticket_votes WHERE ticket_id = t.id AND vote = 'pour') as votes_pour,
        (SELECT COUNT(*) FROM ticket_votes WHERE ticket_id = t.id AND vote = 'contre') as votes_contre,
        (SELECT COUNT(*) FROM ticket_votes WHERE ticket_id = t.id) as total_votes,
        false as is_unread,
        0 as unread_count
      FROM tickets t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN users u ON u.id = t.assigned_to_user_id
      ${whereClause}
      ORDER BY t.closed_at DESC NULLS LAST, t.updated_at DESC
      LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}
    `;
    
    // Ajouter limit et offset aux paramètres
    whereParams.push(parseInt(limit), parseInt(offset));
    
    // Exécuter la requête
    const tickets = await sql(query, whereParams);
    
    // Compter le total d'archives
    const countQuery = `
      SELECT COUNT(*) as total
      FROM tickets t
      ${whereClause}
    `;
    
    const countResult = await sql(countQuery, whereParams.slice(0, -2)); // Sans limit et offset
    const totalArchived = parseInt(countResult[0].total);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        tickets,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: totalArchived
        },
        stats: {
          total_archived: totalArchived
        }
      })
    };
    
  } catch (error) {
    console.error('Erreur get-archived-tickets:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};
