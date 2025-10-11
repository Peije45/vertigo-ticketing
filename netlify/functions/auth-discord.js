// netlify/functions/auth-discord.js
// Redirection vers Discord OAuth

exports.handler = async (event, context) => {
  const CLIENT_ID = process.env.CLIENT_ID_DISCORD;
  const REDIRECT_URI = `${process.env.SITE_URL}/api/auth/callback`;
  
  if (!CLIENT_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Configuration Discord OAuth manquante' })
    };
  }
  
  // Scopes Discord nécessaires
  const scopes = ['identify', 'email', 'guilds.members.read'];
  
  // URL d'autorisation Discord
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scopes.join('%20')}`;
  
  return {
    statusCode: 302,
    headers: {
      Location: authUrl,
      'Cache-Control': 'no-cache'
    }
  };
};
