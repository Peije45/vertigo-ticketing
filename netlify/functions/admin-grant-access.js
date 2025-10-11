// netlify/functions/admin-grant-access.js
// Donner l'accès au dashboard à un utilisateur (fonction admin)

const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
  const ADMIN_SECRET = process.env.ADMIN_SECRET; // À définir dans vos variables d'environnement
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Méthode non autorisée' })
    };
  }
  
  try {
    const body = JSON.parse(event.body || '{}');
    const { discord_id, admin_secret } = body;
    
    // Vérifier le secret admin
    if (admin_secret !== ADMIN_SECRET) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Secret admin invalide' })
      };
    }
    
    if (!discord_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'discord_id manquant' })
      };
    }
    
    const sql = neon(DATABASE_URL);
    
    // Activer l'accès
    const result = await sql`
      UPDATE users 
      SET can_access_dashboard = true 
      WHERE discord_id = ${discord_id}
      RETURNING *
    `;
    
    if (result.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Utilisateur non trouvé' })
      };
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Accès accordé',
        user: {
          discord_id: result[0].discord_id,
          discord_username: result[0].discord_username,
          can_access_dashboard: result[0].can_access_dashboard
        }
      })
    };
    
  } catch (error) {
    console.error('Erreur admin-grant-access:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};
