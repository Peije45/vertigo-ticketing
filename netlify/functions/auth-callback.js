// netlify/functions/auth-callback.js
// Callback Discord OAuth - Crée/Update user + Session
// ✅ VERSION CORRIGÉE : Gère la redirection vers la page d'origine

const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

exports.handler = async (event, context) => {
  const CLIENT_ID = process.env.CLIENT_ID_DISCORD;
  const CLIENT_SECRET = process.env.SECRET_ID_DISCORD;
  const REDIRECT_URI = `${process.env.SITE_URL}/api/auth/callback`;
  const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
  
  // Récupérer le code OAuth et le state
  const code = event.queryStringParameters?.code;
  const state = event.queryStringParameters?.state;
  
  if (!code) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Code OAuth manquant' })
    };
  }
  
  // ✅ NOUVEAU : Décoder le state pour récupérer la page de retour
  let returnTo = '/';
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
      returnTo = decoded.return_to || '/';
    } catch (e) {
      console.log('Erreur décodage state:', e);
      returnTo = '/';
    }
  }
  
  try {
    // 1. Échanger le code contre un token Discord
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI
      })
    });
    
    if (!tokenResponse.ok) {
      throw new Error('Échec récupération token Discord');
    }
    
    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;
    
    // 2. Récupérer les infos utilisateur Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });
    
    if (!userResponse.ok) {
      throw new Error('Échec récupération utilisateur Discord');
    }
    
    const discordUser = await userResponse.json();
    
    // 3. Connexion à la base de données
    const sql = neon(DATABASE_URL);
    
    // 4. Vérifier si l'utilisateur existe déjà
    const existingUsers = await sql`
      SELECT * FROM users WHERE discord_id = ${discordUser.id}
    `;
    
    let user;
    const avatarUrl = discordUser.avatar 
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator) % 5}.png`;
    
    if (existingUsers.length > 0) {
      // Mettre à jour l'utilisateur existant
      const updatedUsers = await sql`
        UPDATE users SET
          discord_username = ${discordUser.username},
          discord_discriminator = ${discordUser.discriminator || '0'},
          discord_avatar_url = ${avatarUrl},
          discord_email = ${discordUser.email || null},
          discord_global_name = ${discordUser.global_name || discordUser.username},
          last_login = CURRENT_TIMESTAMP
        WHERE discord_id = ${discordUser.id}
        RETURNING *
      `;
      user = updatedUsers[0];
    } else {
      // Créer un nouvel utilisateur (par défaut sans accès)
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
          last_login
        ) VALUES (
          ${discordUser.id},
          ${discordUser.username},
          ${discordUser.discriminator || '0'},
          ${avatarUrl},
          ${discordUser.email || null},
          ${discordUser.global_name || discordUser.username},
          false,
          false,
          CURRENT_TIMESTAMP
        )
        RETURNING *
      `;
      user = newUsers[0];
    }
    
    // 5. Vérifier l'accès au dashboard
    if (!user.can_access_dashboard) {
      // Utilisateur non autorisé
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html'
        },
        body: `
          <!DOCTYPE html>
          <html lang="fr">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Accès refusé - Vertigo RP</title>
            <style>
              :root {
                --discord-dark: #2b2d31;
                --discord-darker: #1e1f22;
                --text-primary: #f2f3f5;
                --text-secondary: #b5bac1;
                --danger: #ed4245;
              }
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Arial, sans-serif;
                background: var(--discord-darker);
                color: var(--text-primary);
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
              }
              .container {
                text-align: center;
                max-width: 600px;
                padding: 2rem;
                background: var(--discord-dark);
                border-radius: 8px;
              }
              h1 {
                color: var(--danger);
                font-size: 2rem;
                margin-bottom: 1rem;
              }
              p {
                color: var(--text-secondary);
                font-size: 1.1rem;
                line-height: 1.6;
                margin-bottom: 1.5rem;
              }
              .info {
                background: rgba(237, 66, 69, 0.1);
                border: 1px solid var(--danger);
                border-radius: 6px;
                padding: 1rem;
                margin-bottom: 1.5rem;
              }
              .discord-info {
                color: var(--text-secondary);
                font-size: 0.9rem;
                margin-top: 1rem;
              }
              a {
                color: #5865f2;
                text-decoration: none;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>⛔ Accès refusé</h1>
              <p>Votre compte Discord est connecté, mais vous n'avez pas l'autorisation d'accéder au dashboard.</p>
              <div class="info">
                <strong>Compte connecté:</strong><br>
                ${discordUser.global_name || discordUser.username}#${discordUser.discriminator || '0'}<br>
                Discord ID: ${discordUser.id}
              </div>
              <p>Contactez un administrateur pour demander l'accès au dashboard.</p>
              <div class="discord-info">
                <a href="/">← Retour à l'accueil</a>
              </div>
            </div>
          </body>
          </html>
        `
      };
    }
    
    // 6. Vérifier l'accès super admin si tentative d'accès à /admin.html
    if (returnTo === '/admin.html' && !user.is_super_admin) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html'
        },
        body: `
          <!DOCTYPE html>
          <html lang="fr">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Accès refusé - Admin Panel</title>
            <style>
              :root {
                --discord-dark: #2b2d31;
                --discord-darker: #1e1f22;
                --text-primary: #f2f3f5;
                --text-secondary: #b5bac1;
                --danger: #ed4245;
              }
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Arial, sans-serif;
                background: var(--discord-darker);
                color: var(--text-primary);
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
              }
              .container {
                text-align: center;
                max-width: 600px;
                padding: 2rem;
                background: var(--discord-dark);
                border-radius: 8px;
              }
              h1 {
                color: var(--danger);
                font-size: 2rem;
                margin-bottom: 1rem;
              }
              p {
                color: var(--text-secondary);
                font-size: 1.1rem;
                line-height: 1.6;
                margin-bottom: 1.5rem;
              }
              .info {
                background: rgba(237, 66, 69, 0.1);
                border: 1px solid var(--danger);
                border-radius: 6px;
                padding: 1rem;
                margin-bottom: 1.5rem;
              }
              .btn {
                display: inline-block;
                padding: 0.75rem 1.5rem;
                background: #5865f2;
                color: white;
                text-decoration: none;
                border-radius: 6px;
                margin-top: 1rem;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>👑 Accès Super Admin requis</h1>
              <p>Vous avez accès au dashboard, mais seuls les Super Administrateurs peuvent accéder au panel d'administration.</p>
              <div class="info">
                <strong>Votre compte:</strong><br>
                ${discordUser.global_name || discordUser.username}<br>
                Statut: Staff avec accès dashboard
              </div>
              <p>Contactez un Super Admin pour demander les droits d'administration.</p>
              <a href="/" class="btn">← Retour au Dashboard</a>
            </div>
          </body>
          </html>
        `
      };
    }
    
    // 7. Créer une session pour l'utilisateur autorisé
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    
    await sql`
      INSERT INTO sessions (
        user_id,
        discord_access_token,
        discord_refresh_token,
        discord_token_expires_at,
        session_token,
        expires_at,
        ip_address,
        user_agent
      ) VALUES (
        ${user.id},
        ${access_token},
        ${refresh_token || null},
        ${tokenExpiresAt.toISOString()},
        ${sessionToken},
        ${expiresAt.toISOString()},
        ${event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown'},
        ${event.headers['user-agent'] || 'unknown'}
      )
    `;
    
    // 8. ✅ NOUVEAU : Rediriger vers la page d'origine (state décodé)
    return {
      statusCode: 302,
      headers: {
        Location: returnTo,
        'Set-Cookie': `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
        'Cache-Control': 'no-cache'
      }
    };
    
  } catch (error) {
    console.error('Erreur auth callback:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erreur lors de l\'authentification',
        details: error.message 
      })
    };
  }
};
