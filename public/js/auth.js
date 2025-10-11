// public/js/auth.js
// Gestion de l'authentification côté client

// Variables globales
let currentUser = null;

// Vérifier si l'utilisateur est connecté au chargement
async function checkAuth() {
  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'include'
    });
    
    if (response.ok) {
      currentUser = await response.json();
      onAuthSuccess(currentUser);
    } else {
      onAuthFail();
    }
  } catch (error) {
    console.error('Erreur vérification auth:', error);
    onAuthFail();
  }
}

// Connexion avec Discord
function loginWithDiscord() {
  window.location.href = '/api/auth/discord';
}

// Déconnexion
function logout() {
  if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
    window.location.href = '/api/auth/logout';
  }
}

// Succès de l'authentification
function onAuthSuccess(user) {
  console.log('Utilisateur connecté:', user);
  
  // Afficher le dashboard
  const appElement = document.getElementById('app');
  if (appElement) {
    appElement.style.display = 'block';
  }
  
  const loginScreen = document.getElementById('login-screen');
  if (loginScreen) {
    loginScreen.style.display = 'none';
  }
  
  // Mettre à jour les infos utilisateur dans le header
  updateUserInfo(user);
  
  // Charger les tickets
  loadTickets();
}

// Échec de l'authentification
function onAuthFail() {
  console.log('Utilisateur non connecté');
  
  // Cacher le dashboard
  const appElement = document.getElementById('app');
  if (appElement) {
    appElement.style.display = 'none';
  }
  
  // Afficher l'écran de connexion
  showLoginScreen();
}

// Afficher l'écran de connexion
function showLoginScreen() {
  const loginScreen = document.getElementById('login-screen');
  if (loginScreen) {
    loginScreen.style.display = 'flex';
    return;
  }
  
  // Créer l'écran de connexion s'il n'existe pas
  const loginHTML = `
    <div id="login-screen" style="
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #1e1f22;
    ">
      <div style="
        text-align: center;
        max-width: 500px;
        padding: 3rem;
        background: #2b2d31;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      ">
        <div style="font-size: 3rem; margin-bottom: 1rem;">🎮</div>
        <h1 style="
          font-size: 2rem;
          margin-bottom: 0.5rem;
          background: linear-gradient(45deg, #9146ff, #5865f2);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        ">VERTIGO RP</h1>
        <h2 style="
          font-size: 1.3rem;
          color: #f2f3f5;
          margin-bottom: 1rem;
        ">Dashboard Ticketing</h2>
        <p style="
          color: #b5bac1;
          margin-bottom: 2rem;
          line-height: 1.6;
        ">
          Connectez-vous avec votre compte Discord pour accéder au dashboard de gestion des tickets.
        </p>
        <button onclick="loginWithDiscord()" style="
          background: #5865f2;
          color: white;
          border: none;
          padding: 0.9rem 2rem;
          border-radius: 6px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        " onmouseover="this.style.background='#4752c4'" onmouseout="this.style.background='#5865f2'">
          🔐 Se connecter avec Discord
        </button>
        <div style="
          margin-top: 2rem;
          padding-top: 1.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          color: #80848e;
          font-size: 0.85rem;
        ">
          Seuls les membres du staff autorisés peuvent accéder à cette interface.
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('afterbegin', loginHTML);
}

// Mettre à jour les infos utilisateur dans le header
function updateUserInfo(user) {
  const userNameElement = document.querySelector('.user-name');
  const userRoleElement = document.querySelector('.user-role');
  const userAvatarElement = document.querySelector('.user-avatar');
  
  if (userNameElement) {
    userNameElement.textContent = user.discord_global_name || user.discord_username;
  }
  
  if (userRoleElement) {
    userRoleElement.textContent = getRoleDisplay(user.roles);
  }
  
  if (userAvatarElement) {
    userAvatarElement.src = user.discord_avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';
    userAvatarElement.alt = user.discord_username;
  }
}

// Obtenir l'affichage du rôle principal
function getRoleDisplay(roles) {
  if (!roles || roles.length === 0) {
    return '👤 Staff';
  }
  
  // Ordre de priorité des rôles
  const roleOrder = ['fondateur', 'dev', 'admin', 'modo', 'support'];
  const roleEmojis = {
    'fondateur': '👑',
    'dev': '💻',
    'admin': '⚡',
    'modo': '🛡️',
    'support': '🎯'
  };
  
  for (const roleName of roleOrder) {
    const role = roles.find(r => r.role_name === roleName);
    if (role) {
      return `${roleEmojis[roleName] || '👤'} ${role.role_name.charAt(0).toUpperCase() + role.role_name.slice(1)}`;
    }
  }
  
  // Si aucun rôle reconnu, afficher le premier
  const firstRole = roles[0];
  return `👤 ${firstRole.role_name.charAt(0).toUpperCase() + firstRole.role_name.slice(1)}`;
}

// Fonction utilitaire pour formater les dates
function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'À l\'instant';
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  
  return date.toLocaleDateString('fr-FR', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
}

// Initialiser l'authentification au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});
