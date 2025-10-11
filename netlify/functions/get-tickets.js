// netlify/functions/get-tickets.js
// Récupérer les tickets avec filtres

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
    
    // Construire les conditions de filtrage
    let conditions = [];
    
    // Requête de base
    let query = sql`
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
    `;
    
    // Appliquer les filtres selon les paramètres
    let tickets;
    
    if (status && priority && category_id && assigned_to) {
      // Tous les filtres
      if (assigned_to === 'unassigned') {
        tickets = await sql`
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
          WHERE t.status = ${status}
            AND t.priority = ${priority}
            AND t.category_id = ${parseInt(category_id)}
            AND t.assigned_to_user_id IS NULL
          ORDER BY 
            CASE WHEN t.is_unread THEN 0 ELSE 1 END,
            CASE t.priority 
              WHEN 'haute' THEN 1 
              WHEN 'moyenne' THEN 2 
              WHEN 'basse' THEN 3 
            END,
            t.created_at DESC
          LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
        `;
      } else {
        const assignedUserId = assigned_to === 'me' ? userId : assigned_to;
        tickets = await sql`
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
          WHERE t.status = ${status}
            AND t.priority = ${priority}
            AND t.category_id = ${parseInt(category_id)}
            AND t.assigned_to_user_id = ${assignedUserId}
          ORDER BY 
            CASE WHEN t.is_unread THEN 0 ELSE 1 END,
            CASE t.priority 
              WHEN 'haute' THEN 1 
              WHEN 'moyenne' THEN 2 
              WHEN 'basse' THEN 3 
            END,
            t.created_at DESC
          LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
        `;
      }
    } else if (status) {
      // Filtre par statut uniquement
      tickets = await sql`
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
        WHERE t.status = ${status}
        ORDER BY 
          CASE WHEN t.is_unread THEN 0 ELSE 1 END,
          CASE t.priority 
            WHEN 'haute' THEN 1 
            WHEN 'moyenne' THEN 2 
            WHEN 'basse' THEN 3 
          END,
          t.created_at DESC
        LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
      `;
    } else if (category_id) {
      // Filtre par catégorie
      tickets = await sql`
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
        WHERE t.category_id = ${parseInt(category_id)}
        ORDER BY 
          CASE WHEN t.is_unread THEN 0 ELSE 1 END,
          CASE t.priority 
            WHEN 'haute' THEN 1 
            WHEN 'moyenne' THEN 2 
            WHEN 'basse' THEN 3 
          END,
          t.created_at DESC
        LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
      `;
    } else {
      // Tous les tickets
      tickets = await sql`
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
        ORDER BY 
          CASE WHEN t.is_unread THEN 0 ELSE 1 END,
          CASE t.priority 
            WHEN 'haute' THEN 1 
            WHEN 'moyenne' THEN 2 
            WHEN 'basse' THEN 3 
          END,
          t.created_at DESC
        LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
      `;
    }
    
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
