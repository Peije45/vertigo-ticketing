// netlify/functions/admin-list-users.js
// Liste tous les utilisateurs (réservé aux super admins)

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
    
    // Vérifier que l'utilisateur est un super admin
    const sessions = await sql`
      SELECT u.id, u.is_super_admin
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
    
    if (!sessions[0].is_super_admin) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Accès refusé : Super admin uniquement' })
      };
    }
    
    // Récupérer tous les utilisateurs avec leurs rôles
    const users = await sql`
      SELECT 
        u.id,
        u.discord_id,
        u.discord_username,
        u.discord_discriminator,
        u.discord_global_name,
        u.discord_avatar_url,
        u.discord_email,
        u.can_access_dashboard,
        u.is_super_admin,
        u.is_active,
        u.last_login,
        u.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'role_id', r.id,
              'role_name', r.name,
              'role_color', r.color
            )
          ) FILTER (WHERE r.id IS NOT NULL),
          '[]'
        ) as roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      GROUP BY u.id
      ORDER BY u.is_super_admin DESC, u.created_at DESC
    `;
    
    // Statistiques
    const stats = await sql`
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE can_access_dashboard = true) as users_with_access,
        COUNT(*) FILTER (WHERE is_super_admin = true) as super_admins,
        COUNT(*) FILTER (WHERE is_active = true) as active_users,
        COUNT(*) FILTER (WHERE last_login > CURRENT_TIMESTAMP - INTERVAL '7 days') as active_last_7d
      FROM users
    `;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        users,
        stats: stats[0]
      })
    };
    
  } catch (error) {
    console.error('Erreur admin-list-users:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};
