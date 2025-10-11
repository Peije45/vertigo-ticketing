// netlify/functions/admin-add-user-by-id.js
// Ajouter un utilisateur via son Discord ID (réservé aux super admins)

const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  
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
    const { discord_id, can_access_dashboard = false, role_ids = [] } = body;
    
    if (!discord_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'discord_id requis' })
      };
    }
    
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
    
    const adminUserId = sessions[0].id;
    
    // Vérifier si l'utilisateur existe déjà
    const existingUsers = await sql`
      SELECT id, discord_username FROM users 
      WHERE discord_id = ${discord_id}
    `;
    
    if (existingUsers.length > 0) {
      return {
        statusCode: 409,
        body: JSON.stringify({ 
          error: 'Utilisateur déjà existant',
          user: existingUsers[0]
        })
      };
    }
    
    // Récupérer les infos de l'utilisateur depuis Discord API
    const discordResponse = await fetch(`https://discord.com/api/v10/users/${discord_id}`, {
      headers: {
        'Authorization': `Bot ${DISCORD_BOT_TOKEN}`
      }
    });
    
    if (!discordResponse.ok) {
      return {
        statusCode: 404,
        body: JSON.stringify({ 
          error: 'Utilisateur Discord non trouvé',
          details: 'Vérifiez que le Discord ID est correct'
        })
      };
    }
    
    const discordUser = await discordResponse.json();
    
    // Créer l'utilisateur dans la BDD
    const avatarUrl = discordUser.avatar 
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || '0') % 5}.png`;
    
    const newUsers = await sql`
      INSERT INTO users (
        discord_id,
        discord_username,
        discord_discriminator,
        discord_avatar_url,
        discord_email,
        discord_global_name,
        can_access_dashboard,
        is_super_admin,
        is_active
      ) VALUES (
        ${discordUser.id},
        ${discordUser.username},
        ${discordUser.discriminator || '0'},
        ${avatarUrl},
        ${discordUser.email || null},
        ${discordUser.global_name || discordUser.username},
        ${can_access_dashboard},
        false,
        true
      )
      RETURNING *
    `;
    
    const newUser = newUsers[0];
    
    // Assigner les rôles si fournis
    if (role_ids && role_ids.length > 0) {
      for (const role_id of role_ids) {
        await sql`
          INSERT INTO user_roles (user_id, role_id, assigned_by_user_id)
          VALUES (${newUser.id}, ${role_id}, ${adminUserId})
          ON CONFLICT DO NOTHING
        `;
      }
    }
    
    // Récupérer l'utilisateur avec ses rôles
    const finalUser = await sql`
      SELECT 
        u.*,
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
      WHERE u.id = ${newUser.id}
      GROUP BY u.id
    `;
    
    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        message: 'Utilisateur créé avec succès',
        user: finalUser[0]
      })
    };
    
  } catch (error) {
    console.error('Erreur admin-add-user-by-id:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};
