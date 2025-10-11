// netlify/functions/admin-update-user.js
// Modifier les permissions et rôles d'un utilisateur (réservé aux super admins)

const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
  
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
    const { 
      user_id, 
      can_access_dashboard,
      is_active,
      role_ids
    } = body;
    
    if (!user_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'user_id requis' })
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
    
    // Vérifier que l'utilisateur cible existe
    const targetUsers = await sql`
      SELECT * FROM users WHERE id = ${user_id}
    `;
    
    if (targetUsers.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Utilisateur non trouvé' })
      };
    }
    
    const targetUser = targetUsers[0];
    
    // Empêcher de se désactiver soi-même
    if (targetUser.id === adminUserId && is_active === false) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Vous ne pouvez pas vous désactiver vous-même' })
      };
    }
    
    // Empêcher de retirer son propre accès super admin
    if (targetUser.is_super_admin && targetUser.id === adminUserId && can_access_dashboard === false) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Vous ne pouvez pas retirer votre propre accès dashboard' })
      };
    }
    
    // Construire la requête UPDATE dynamiquement
    const updates = [];
    const params = [user_id];
    let paramIndex = 2;
    
    if (typeof can_access_dashboard === 'boolean') {
      updates.push(`can_access_dashboard = $${paramIndex}`);
      params.push(can_access_dashboard);
      paramIndex++;
    }
    
    if (typeof is_active === 'boolean') {
      updates.push(`is_active = $${paramIndex}`);
      params.push(is_active);
      paramIndex++;
    }
    
    // Toujours mettre à jour updated_at
    updates.push('updated_at = CURRENT_TIMESTAMP');
    
    if (updates.length > 0) {
      const query = `
        UPDATE users 
        SET ${updates.join(', ')}
        WHERE id = $1
        RETURNING *
      `;
      
      await sql(query, params);
    }
    
    // Mettre à jour les rôles si fournis
    if (Array.isArray(role_ids)) {
      // Supprimer tous les rôles existants
      await sql`
        DELETE FROM user_roles 
        WHERE user_id = ${user_id}
      `;
      
      // Ajouter les nouveaux rôles
      for (const role_id of role_ids) {
        await sql`
          INSERT INTO user_roles (user_id, role_id, assigned_by_user_id)
          VALUES (${user_id}, ${role_id}, ${adminUserId})
          ON CONFLICT DO NOTHING
        `;
      }
    }
    
    // Récupérer l'utilisateur mis à jour avec ses rôles
    const updatedUser = await sql`
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
      WHERE u.id = ${user_id}
      GROUP BY u.id
    `;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        message: 'Utilisateur mis à jour avec succès',
        user: updatedUser[0]
      })
    };
    
  } catch (error) {
    console.error('Erreur admin-update-user:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};
