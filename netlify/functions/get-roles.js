// netlify/functions/get-roles.js
// Récupérer la liste des rôles disponibles

const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
  
  try {
    const sql = neon(DATABASE_URL);
    
    // Récupérer tous les rôles actifs
    const roles = await sql`
      SELECT 
        id,
        name,
        description,
        color,
        is_active
      FROM roles
      WHERE is_active = true
      ORDER BY 
        CASE name
          WHEN 'fondateur' THEN 1
          WHEN 'dev' THEN 2
          WHEN 'admin' THEN 3
          WHEN 'modo' THEN 4
          WHEN 'support' THEN 5
          ELSE 6
        END
    `;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600' // Cache 1h
      },
      body: JSON.stringify(roles)
    };
    
  } catch (error) {
    console.error('Erreur get-roles:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur serveur',
        details: error.message 
      })
    };
  }
};
