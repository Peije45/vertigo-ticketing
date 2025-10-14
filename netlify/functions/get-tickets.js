// netlify/functions/get-tickets.js
// Récupérer les tickets avec filtres - VERSION CORRIGÉE

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
      status,
      priority,
      category_id,
      assigned_to,
      search,
      limit = '50',
      offset = '0'
    } = params;
    
    // Construire dynamiquement les conditions WHERE
    const whereConditions = [];
    const whereParams = [];
    
    // Filtre par statut
    if (status) {
      whereConditions.push(`t.status = $${whereConditions.length + 1}`);
      whereParams.push(status);
    }
    
    // Filtre par priorité
    if (priority) {
      whereConditions.push(`t.priority = $${whereConditions.length + 1}`);
      whereParams.push(priority);
    }
    
    // Filtre par catégorie
    if (category_id) {
      whereConditions.push(`t.category_id = $${whereConditions.length + 1}`);
      whereParams.push(parseInt(category_id));
    }
    
    // Filtre par assignation
    if (assigned_to) {
      if (assigned_to === 'unassigned') {
        whereConditions.push('t.assigned_to_user_id IS NULL');
      } else if (assigned_to === 'me') {
        whereConditions.push(`t.assigned_to_user_id = $${whereConditions.length + 1}`);
        whereParams.push(userId);
      } else {
        // ID spécifique
        whereConditions.push(`t.assigned_to_user_id = $${whereConditions.length + 1}`);
        whereParams.push(assigned_to);
      }
    }
    
    // Filtre par recherche (titre ou username)
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
    
    // Requête SQL complète avec les filtres dynamiques et statut de lecture par utilisateur
    const query = `
      SELECT 
        t.*,
        c.name as category_name,
        c.emoji as category_emoji,
        c.color as category_color,
        u.discord_username as assigned_to_username,
        u.discord_avatar_url as assigned_to_avatar,
        u.discord_global_name as assigned_to_display_name,
        -- Calculer le statut de lecture par utilisateur
        COALESCE(trs.last_read_at, '1970-01-01'::timestamp) as user_last_read_at,
        -- Compter les messages non lus par utilisateur (messages postés après last_read_at)
        (
          SELECT COUNT(*)
          FROM ticket_messages tm
          WHERE tm.ticket_id = t.id
            AND tm.deleted_at IS NULL
            AND tm.created_at > COALESCE(trs.last_read_at, '1970-01-01'::timestamp)
        ) as unread_count,
        -- Déterminer si le ticket a des messages non lus pour cet utilisateur
        CASE 
          WHEN EXISTS (
            SELECT 1 
            FROM ticket_messages tm
            WHERE tm.ticket_id = t.id
              AND tm.deleted_at IS NULL
              AND tm.created_at > COALESCE(trs.last_read_at, '1970-01-01'::timestamp)
          ) THEN true
          ELSE false
        END as is_unread
      FROM tickets t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN users u ON u.id = t.assigned_to_user_id
      LEFT JOIN ticket_read_status trs ON trs.ticket_id = t.id AND trs.user_id = $${whereParams.length + 1}
      ${whereClause}
      ORDER BY 
        -- Prioriser les tickets non lus par l'utilisateur connecté
        CASE 
          WHEN EXISTS (
            SELECT 1 
            FROM ticket_messages tm
            WHERE tm.ticket_id = t.id
              AND tm.deleted_at IS NULL
              AND tm.created_at > COALESCE(trs.last_read_at, '1970-01-01'::timestamp)
          ) THEN 0 
          ELSE 1 
        END,
        CASE t.priority 
          WHEN 'haute' THEN 1 
          WHEN 'moyenne' THEN 2 
          WHEN 'basse' THEN 3 
        END,
        t.created_at DESC
      LIMIT $${whereParams.length + 2} OFFSET $${whereParams.length + 3}
    `;
    
    // Ajouter userId, limit et offset aux paramètres
    whereParams.push(userId, parseInt(limit), parseInt(offset));
    
    // Exécuter la requête avec les paramètres
    const tickets = await sql(query, whereParams);
    
    // Récupérer les statistiques
    const stats = await sql`
      SELECT 
        COUNT(*) FILTER (WHERE priority = 'haute' AND status != 'resolu') as urgent_count,
        COUNT(*) FILTER (WHERE status = 'en_cours') as pending_count,
        COUNT(*) FILTER (WHERE status = 'resolu' AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days') as resolved_7d_count,
        COALESCE(
          EXTRACT(EPOCH FROM AVG(closed_at - created_at)) / 3600,
          0
        )::numeric(10,1) as avg_resolution_hours
      FROM tickets
    `;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        tickets,
        stats: stats[0],
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: tickets.length
        }
      })
    };
    
  } catch (error) {
    console.error('Erreur get-tickets:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};
