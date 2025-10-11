// netlify/functions/auth-logout.js
// Déconnexion utilisateur

const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
  
  // Récupérer le token de session depuis les cookies
  const cookies = event.headers.cookie || '';
  const sessionToken = cookies.split(';')
    .find(c => c.trim().startsWith('session='))
    ?.split('=')[1];
  
  if (sessionToken) {
    try {
      const sql = neon(DATABASE_URL);
      
      // Supprimer la session de la base de données
      await sql`
        DELETE FROM sessions 
        WHERE session_token = ${sessionToken}
      `;
    } catch (error) {
      console.error('Erreur suppression session:', error);
    }
  }
  
  // Supprimer le cookie et rediriger vers l'accueil
  return {
    statusCode: 302,
    headers: {
      Location: '/',
      'Set-Cookie': 'session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
      'Cache-Control': 'no-cache'
    }
  };
};
