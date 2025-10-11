// netlify/functions/auth-me.js
// Récupérer l'utilisateur connecté

const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
  
  // Récupérer le token de session depuis les cookies
  const cookies = event.headers.cookie || '';
  const sessionToken = cookies.split(';')
    .find(c => c.trim().startsWith('session='))
    ?.split('=')[1];
  
  if (!sessionToken) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Non connecté' })
    };
  }
  
  try {
    const sql = neon(DATABASE_URL);
    
    // Récupérer l'utilisateur via la session
    const result = await sql`
      SELECT 
        u.id,
        u.discord_id,
        u.discord_username,
        u.discord_discriminator,
        u.discord_avatar_url,
        u.discord_email,
        u.discord_global_name,
        u.can_access_dashboard,
        u.last_login,
        s.expires_at as session_expires,
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
      JOIN sessions s ON s.user_id = u.id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE s.session_token = ${sessionToken}
        AND s.expires_at > CURRENT_TIMESTAMP
      GROUP BY u.id, s.expires_at
    `;
    
    if (result.length === 0) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Session expirée ou invalide' })
      };
    }
    
    const user = result[0];
    
    // Vérifier que l'utilisateur a toujours accès
    if (!user.can_access_dashboard) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Accès non autorisé' })
      };
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        id: user.id,
        discord_id: user.discord_id,
        discord_username: user.discord_username,
        discord_discriminator: user.discord_discriminator,
        discord_avatar_url: user.discord_avatar_url,
        discord_email: user.discord_email,
        discord_global_name: user.discord_global_name,
        roles: user.roles,
        session_expires: user.session_expires
      })
    };
    
  } catch (error) {
    console.error('Erreur auth-me:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};
