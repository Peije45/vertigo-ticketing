// netlify/functions/auth-discord.js
// Redirection vers Discord OAuth avec gestion de la page de retour

exports.handler = async (event, context) => {
  const CLIENT_ID = process.env.CLIENT_ID_DISCORD;
  const REDIRECT_URI = `${process.env.SITE_URL}/api/auth/callback`;
  
  if (!CLIENT_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Configuration Discord OAuth manquante' })
    };
  }
  
  // Récupérer la page de retour depuis les query params
  const returnTo = event.queryStringParameters?.return_to || '/';
  
  // Scopes Discord nécessaires
  const scopes = ['identify', 'email', 'guilds.members.read'];
  
  // Encoder le returnTo dans le state OAuth (pour le récupérer après callback)
  const state = Buffer.from(JSON.stringify({ return_to: returnTo })).toString('base64');
  
  // URL d'autorisation Discord avec state
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scopes.join('%20')}&state=${encodeURIComponent(state)}`;
  
  return {
    statusCode: 302,
    headers: {
      Location: authUrl,
      'Cache-Control': 'no-cache'
    }
  };
};
