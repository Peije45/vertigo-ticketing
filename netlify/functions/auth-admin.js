// public/js/auth-admin.js
// ✅ Gestion de l'authentification pour la page ADMIN - VERSION CORRIGÉE
// S'assure que l'utilisateur est super admin et gère la redirection OAuth

let currentUser = null;

// Vérifier si l'utilisateur est connecté et s'il est super admin
async function checkAdminAuth() {
  try {
    console.log('🔐 Vérification authentification admin...');
    const response = await fetch('/api/auth/me', {
      credentials: 'include'
    });
    
    if (response.ok) {
      currentUser = await response.json();
      console.log('✅ Utilisateur authentifié:', currentUser);
      
      // Vérifier que l'utilisateur est super admin
      if (!currentUser.is_super_admin) {
        console.warn('⚠️ Utilisateur non super admin');
        showAccessDenied('Vous devez être Super Admin pour accéder à cette page.');
        return false;
      }
      
      console.log('✅ Super admin vérifié');
      onAdminAuthSuccess(currentUser);
      return true;
    } else {
      console.warn('⚠️ Non authentifié');
      onAdminAuthFail();
      return false;
    }
  } catch (error) {
    console.error('❌ Erreur vérification auth admin:', error);
    onAdminAuthFail();
    return false;
  }
}

// Connexion avec Discord depuis la page admin
function loginWithDiscordAdmin() {
  // ✅ IMPORTANT : Passer le paramètre return_to pour revenir sur admin.html
  console.log('🔐 Redirection vers Discord OAuth...');
  window.location.href = '/api/auth/discord?return_to=/admin.html';
}

// Déconnexion
function logout() {
  if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
    console.log('🚪 Déconnexion...');
    window.location.href = '/api/auth/logout';
  }
}

// Succès de l'authentification admin
function onAdminAuthSuccess(user) {
  console.log('✅ Admin connecté:', user);
  
  // Mettre à jour l'interface si nécessaire
  updateAdminUserInfo(user);
}

// Mettre à jour les infos utilisateur dans le header (si présent)
function updateAdminUserInfo(user) {
  const userNameElement = document.querySelector('.user-name');
  const userRoleElement = document.querySelector('.user-role');
  const userAvatarElement = document.querySelector('.user-avatar');
  
  if (userNameElement) {
    userNameElement.textContent = user.discord_global_name || user.discord_username;
  }
  
  if (userRoleElement) {
    userRoleElement.textContent = '👑 Super Admin';
  }
  
  if (userAvatarElement) {
    userAvatarElement.src = user.discord_avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';
    userAvatarElement.alt = user.discord_username;
  }
}

// Échec de l'authentification
function onAdminAuthFail() {
  console.log('❌ Non connecté ou non autorisé');
  showAdminLoginScreen();
}

// Afficher l'écran de connexion pour admin
function showAdminLoginScreen() {
  document.body.innerHTML = `
    <div style="
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
        <div style="font-size: 3rem; margin-bottom: 1rem;">👑</div>
        <h1 style="
          font-size: 2rem;
          margin-bottom: 0.5rem;
          background: linear-gradient(45deg, #9146ff, #5865f2);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        ">ADMIN PANEL</h1>
        <h2 style="
          font-size: 1.3rem;
          color: #f2f3f5;
          margin-bottom: 1rem;
        ">Vertigo RP Dashboard</h2>
        <p style="
          color: #b5bac1;
          margin-bottom: 2rem;
          line-height: 1.6;
        ">
          Connectez-vous avec votre compte Discord pour accéder au panel d'administration.
        </p>
        <button onclick="loginWithDiscordAdmin()" style="
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
          color: #ed4245;
          font-size: 0.85rem;
          font-weight: 600;
        ">
          ⚠️ Accès réservé aux Super Administrateurs uniquement
        </div>
        <div style="
          margin-top: 1rem;
          color: #80848e;
          font-size: 0.8rem;
        ">
          <a href="/" style="color: #5865f2; text-decoration: none;">← Retour au Dashboard</a>
        </div>
      </div>
    </div>
  `;
}

// Afficher message d'accès refusé
function showAccessDenied(message) {
  document.body.innerHTML = `
    <div style="
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
        <div style="font-size: 3rem; margin-bottom: 1rem;">⛔</div>
        <h1 style="
          font-size: 2rem;
          margin-bottom: 1rem;
          color: #ed4245;
        ">Accès refusé</h1>
        <p style="
          color: #b5bac1;
          margin-bottom: 2rem;
          line-height: 1.6;
        ">
          ${message}
        </p>
        <div style="
          background: rgba(237, 66, 69, 0.1);
          border: 1px solid #ed4245;
          border-radius: 6px;
          padding: 1rem;
          margin-bottom: 1.5rem;
          color: #f2f3f5;
        ">
          <strong>Compte connecté:</strong><br>
          ${currentUser?.discord_global_name || currentUser?.discord_username || 'Inconnu'}<br>
          <span style="font-size: 0.85rem; color: #b5bac1;">
            Vous avez accès au dashboard mais pas au panel admin
          </span>
        </div>
        <a href="/" style="
          display: inline-block;
          background: #5865f2;
          color: white;
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          text-decoration: none;
          font-weight: 600;
        ">← Retour au Dashboard</a>
      </div>
    </div>
  `;
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

// Initialiser l'authentification admin au chargement de la page
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Initialisation auth admin...');
  await checkAdminAuth();
});
