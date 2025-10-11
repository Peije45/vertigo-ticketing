// public/js/admin.js
// Gestion de la page d'administration

let allUsers = [];
let allRoles = [];

// Charger les rôles disponibles
async function loadRoles() {
  try {
    const response = await fetch('/api/get-roles', {
      credentials: 'include'
    });
    
    if (response.ok) {
      allRoles = await response.json();
      populateRolesCheckboxes();
    }
  } catch (error) {
    console.error('Erreur chargement rôles:', error);
  }
}

// Peupler les checkboxes de rôles
function populateRolesCheckboxes() {
  const addContainer = document.getElementById('rolesCheckboxes');
  const editContainer = document.getElementById('editRolesCheckboxes');
  
  const roleEmojis = {
    'fondateur': '👑',
    'dev': '💻',
    'admin': '⚡',
    'modo': '🛡️',
    'support': '🎯'
  };
  
  const html = allRoles.map(role => `
    <label class="checkbox-group">
      <input type="checkbox" value="${role.id}" class="role-checkbox">
      <span>${roleEmojis[role.name] || '👤'} ${role.name.charAt(0).toUpperCase() + role.name.slice(1)}</span>
    </label>
  `).join('');
  
  if (addContainer) addContainer.innerHTML = html;
  if (editContainer) editContainer.innerHTML = html;
}

// Charger tous les utilisateurs
async function loadUsers() {
  try {
    const response = await fetch('/api/admin/list-users', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      if (response.status === 403) {
        alert('❌ Accès refusé : Vous devez être super admin');
        window.location.href = '/';
        return;
      }
      throw new Error('Erreur chargement utilisateurs');
    }
    
    const data = await response.json();
    allUsers = data.users;
    
    // Mettre à jour les stats
    updateStats(data.stats);
    
    // Afficher les utilisateurs
    displayUsers(allUsers);
    
  } catch (error) {
    console.error('Erreur loadUsers:', error);
    showError('Impossible de charger les utilisateurs');
  }
}

// Mettre à jour les statistiques
function updateStats(stats) {
  const statCards = document.querySelectorAll('.stat-card .stat-number');
  if (statCards.length >= 4) {
    statCards[0].textContent = stats.total_users || 0;
    statCards[1].textContent = stats.users_with_access || 0;
    statCards[2].textContent = stats.super_admins || 0;
    statCards[3].textContent = stats.active_last_7d || 0;
  }
}

// Afficher les utilisateurs dans le tableau
function displayUsers(users) {
  const tbody = document.getElementById('usersTableBody');
  
  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
          Aucun utilisateur trouvé
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = users.map(user => createUserRow(user)).join('');
}

// Créer une ligne de tableau pour un utilisateur
function createUserRow(user) {
  const accessBadge = user.can_access_dashboard 
    ? '<span class="badge badge-success">✅ Actif</span>'
    : '<span class="badge badge-danger">❌ Aucun</span>';
  
  const statusBadge = user.is_active
    ? '<span class="badge badge-success">Actif</span>'
    : '<span class="badge badge-danger">Inactif</span>';
  
  const superAdminBadge = user.is_super_admin
    ? '<span class="badge badge-super">👑 SUPER ADMIN</span>'
    : '';
  
  const rolesHtml = user.roles && user.roles.length > 0
    ? user.roles.map(role => {
        const emoji = {
          'fondateur': '👑',
          'dev': '💻',
          'admin': '⚡',
          'modo': '🛡️',
          'support': '🎯'
        }[role.role_name] || '👤';
        return `<span class="role-badge">${emoji} ${role.role_name}</span>`;
      }).join('')
    : '<span class="role-badge">Aucun rôle</span>';
  
  const lastLogin = user.last_login 
    ? formatTimeAgo(user.last_login)
    : 'Jamais connecté';
  
  return `
    <tr>
      <td>
        <div class="user-info">
          <img src="${user.discord_avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="Avatar" class="user-avatar">
          <div class="user-details">
            <div class="user-name">${escapeHtml(user.discord_global_name || user.discord_username)}</div>
            <div class="user-id">${user.discord_id}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="roles-list">
          ${superAdminBadge}
          ${rolesHtml}
        </div>
      </td>
      <td>${accessBadge}</td>
      <td>${statusBadge}</td>
      <td style="font-size: 0.85rem; color: var(--text-secondary);">${lastLogin}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-sm" onclick='editUser(${JSON.stringify(user)})'>
            ✏️ Modifier
          </button>
        </div>
      </td>
    </tr>
  `;
}

// Ouvrir le modal d'ajout d'utilisateur
function openAddUserModal() {
  document.getElementById('addUserModal').classList.add('active');
  document.getElementById('discordIdInput').value = '';
  document.getElementById('canAccessCheckbox').checked = false;
  document.querySelectorAll('#rolesCheckboxes .role-checkbox').forEach(cb => cb.checked = false);
  document.getElementById('addUserAlert').innerHTML = '';
}

// Fermer le modal d'ajout
function closeAddUserModal() {
  document.getElementById('addUserModal').classList.remove('active');
}

// Ajouter un utilisateur
async function addUser() {
  const discordId = document.getElementById('discordIdInput').value.trim();
  const canAccess = document.getElementById('canAccessCheckbox').checked;
  const roleIds = Array.from(document.querySelectorAll('#rolesCheckboxes .role-checkbox:checked'))
    .map(cb => parseInt(cb.value));
  
  if (!discordId) {
    showAlert('addUserAlert', 'Veuillez entrer un Discord ID', 'error');
    return;
  }
  
  // Validation format Discord ID (18-19 chiffres)
  if (!/^\d{17,19}$/.test(discordId)) {
    showAlert('addUserAlert', 'Format de Discord ID invalide (doit être 17-19 chiffres)', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/admin/add-user-by-id', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        discord_id: discordId,
        can_access_dashboard: canAccess,
        role_ids: roleIds
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      showAlert('addUserAlert', data.error || 'Erreur lors de l\'ajout', 'error');
      return;
    }
    
    showAlert('addUserAlert', '✅ Utilisateur ajouté avec succès !', 'success');
    
    // Recharger la liste après 1 seconde
    setTimeout(() => {
      closeAddUserModal();
      loadUsers();
    }, 1000);
    
  } catch (error) {
    console.error('Erreur addUser:', error);
    showAlert('addUserAlert', 'Erreur serveur', 'error');
  }
}

// Ouvrir le modal de modification
function editUser(user) {
  document.getElementById('editUserModal').classList.add('active');
  document.getElementById('editUserId').value = user.id;
  
  // Afficher les infos utilisateur
  document.getElementById('editUserInfo').innerHTML = `
    <div class="user-info">
      <img src="${user.discord_avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="Avatar" class="user-avatar">
      <div class="user-details">
        <div class="user-name">${escapeHtml(user.discord_global_name || user.discord_username)}</div>
        <div class="user-id">${user.discord_id}</div>
      </div>
    </div>
  `;
  
  // Cocher les checkboxes
  document.getElementById('editCanAccessCheckbox').checked = user.can_access_dashboard;
  document.getElementById('editIsActiveCheckbox').checked = user.is_active;
  
  // Cocher les rôles
  document.querySelectorAll('#editRolesCheckboxes .role-checkbox').forEach(cb => {
    const roleId = parseInt(cb.value);
    cb.checked = user.roles && user.roles.some(r => r.role_id === roleId);
  });
  
  document.getElementById('editUserAlert').innerHTML = '';
}

// Fermer le modal d'édition
function closeEditUserModal() {
  document.getElementById('editUserModal').classList.remove('active');
}

// Sauvegarder les modifications
async function saveUser() {
  const userId = document.getElementById('editUserId').value;
  const canAccess = document.getElementById('editCanAccessCheckbox').checked;
  const isActive = document.getElementById('editIsActiveCheckbox').checked;
  const roleIds = Array.from(document.querySelectorAll('#editRolesCheckboxes .role-checkbox:checked'))
    .map(cb => parseInt(cb.value));
  
  try {
    const response = await fetch('/api/admin/update-user', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        can_access_dashboard: canAccess,
        is_active: isActive,
        role_ids: roleIds
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      showAlert('editUserAlert', data.error || 'Erreur lors de la modification', 'error');
      return;
    }
    
    showAlert('editUserAlert', '✅ Utilisateur modifié avec succès !', 'success');
    
    // Recharger la liste après 1 seconde
    setTimeout(() => {
      closeEditUserModal();
      loadUsers();
    }, 1000);
    
  } catch (error) {
    console.error('Erreur saveUser:', error);
    showAlert('editUserAlert', 'Erreur serveur', 'error');
  }
}

// Afficher une alerte
function showAlert(containerId, message, type) {
  const container = document.getElementById(containerId);
  const alertClass = type === 'success' ? 'alert-success' : 'alert-error';
  container.innerHTML = `
    <div class="alert ${alertClass}">
      ${message}
    </div>
  `;
}

// Utilitaires
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  alert(`❌ ${message}`);
}

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
  // Vérifier l'authentification
  await checkAuth();
  
  // Charger les rôles et utilisateurs
  await loadRoles();
  await loadUsers();
});
