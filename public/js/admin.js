// public/js/admin.js
// Gestion de la page d'administration - VERSION CORRIGÉE

let allUsers = [];
let allRoles = [];
let isRolesLoaded = false;

// Charger les rôles disponibles
async function loadRoles() {
  try {
    console.log('🔄 Chargement des rôles...');
    const response = await fetch('/api/get-roles', {
      credentials: 'include'
    });
    
    if (response.ok) {
      allRoles = await response.json();
      console.log('✅ Rôles chargés:', allRoles);
      isRolesLoaded = true;
      populateRolesCheckboxes();
      return true;
    } else {
      console.error('❌ Erreur HTTP:', response.status);
      showError('Impossible de charger les rôles');
      return false;
    }
  } catch (error) {
    console.error('❌ Erreur chargement rôles:', error);
    showError('Erreur lors du chargement des rôles');
    return false;
  }
}

// Peupler les checkboxes de rôles
function populateRolesCheckboxes() {
  const addContainer = document.getElementById('rolesCheckboxes');
  const editContainer = document.getElementById('editRolesCheckboxes');
  
  if (!addContainer && !editContainer) {
    console.warn('⚠️ Containers de rôles non trouvés');
    return;
  }
  
  const roleEmojis = {
    'fondateur': '👑',
    'dev': '💻',
    'admin': '⚡',
    'modo': '🛡️',
    'support': '🎯'
  };
  
  if (!allRoles || allRoles.length === 0) {
    const emptyHtml = '<p style="color: var(--text-muted); padding: 1rem;">Aucun rôle disponible</p>';
    if (addContainer) addContainer.innerHTML = emptyHtml;
    if (editContainer) editContainer.innerHTML = emptyHtml;
    return;
  }
  
  const html = allRoles.map(role => `
    <label class="checkbox-group">
      <input type="checkbox" value="${role.id}" class="role-checkbox" data-role-name="${role.name}">
      <span>${roleEmojis[role.name] || '👤'} ${role.name.charAt(0).toUpperCase() + role.name.slice(1)}</span>
    </label>
  `).join('');
  
  if (addContainer) {
    addContainer.innerHTML = html;
    console.log(`✅ ${allRoles.length} rôles ajoutés au modal d'ajout`);
  }
  if (editContainer) {
    editContainer.innerHTML = html;
    console.log(`✅ ${allRoles.length} rôles ajoutés au modal d'édition`);
  }
}

// Charger tous les utilisateurs
async function loadUsers() {
  try {
    console.log('🔄 Chargement des utilisateurs...');
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
    console.log(`✅ ${allUsers.length} utilisateurs chargés`);
    
    // Mettre à jour les stats
    updateStats(data.stats);
    
    // Afficher les utilisateurs
    displayUsers(allUsers);
    
  } catch (error) {
    console.error('❌ Erreur loadUsers:', error);
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
  console.log('📊 Stats mises à jour:', stats);
}

// Afficher les utilisateurs dans le tableau
function displayUsers(users) {
  const tbody = document.getElementById('usersTableBody');
  
  if (!tbody) {
    console.error('❌ Table body non trouvé');
    return;
  }
  
  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
          Aucun utilisateur trouvé
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = users.map(user => createUserRow(user)).join('');
  console.log(`✅ ${users.length} utilisateurs affichés`);
}

// Créer une ligne de tableau pour un utilisateur
function createUserRow(user) {
  const accessBadge = user.can_access_dashboard 
    ? '<span class="badge badge-success">✅ Actif</span>'
    : '<span class="badge badge-danger">❌ Aucun</span>';
  
  const voteManageBadge = user.can_manage_votes 
    ? '<span class="badge badge-success">✅ Autorisé</span>'
    : '<span class="badge badge-danger">❌ Non autorisé</span>';
  
  const statusBadge = user.is_active
    ? '<span class="badge badge-success">Actif</span>'
    : '<span class="badge badge-danger">Inactif</span>';
  
  const superAdminBadge = user.is_super_admin
    ? '<span class="badge badge-super">👑 SUPER ADMIN</span>'
    : '';
  
  // 🔥 CORRECTION : Parser les rôles correctement
  let userRoles = [];
  try {
    if (typeof user.roles === 'string') {
      userRoles = JSON.parse(user.roles);
    } else if (Array.isArray(user.roles)) {
      userRoles = user.roles;
    }
  } catch (e) {
    console.error('Erreur parsing rôles pour user', user.id, e);
    userRoles = [];
  }
  
  const rolesHtml = userRoles && userRoles.length > 0
    ? userRoles.map(role => {
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
  
  // Échapper le JSON pour éviter les problèmes avec les guillemets
  const userDataEscaped = escapeHtml(JSON.stringify(user));
  
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
      <td>
        ${voteManageBadge}
        <br>
        <button class="btn btn-sm" style="margin-top: 0.5rem;" 
                onclick="toggleVoteManagement('${user.id}', ${!user.can_manage_votes})">
          ${user.can_manage_votes ? '🚫 Retirer' : '✅ Autoriser'}
        </button>
      </td>
      <td>${statusBadge}</td>
      <td style="font-size: 0.85rem; color: var(--text-secondary);">${lastLogin}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-sm" onclick='editUser(${userDataEscaped})'>
            ✏️ Modifier
          </button>
        </div>
      </td>
    </tr>
  `;
}

// Ouvrir le modal d'ajout d'utilisateur
function openAddUserModal() {
  // S'assurer que les rôles sont chargés
  if (!isRolesLoaded) {
    console.warn('⚠️ Rôles pas encore chargés, rechargement...');
    loadRoles().then(() => {
      openAddUserModal();
    });
    return;
  }
  
  document.getElementById('addUserModal').classList.add('active');
  document.getElementById('discordIdInput').value = '';
  document.getElementById('canAccessCheckbox').checked = false;
  
  // Décocher toutes les checkboxes
  document.querySelectorAll('#rolesCheckboxes .role-checkbox').forEach(cb => cb.checked = false);
  document.getElementById('addUserAlert').innerHTML = '';
  
  console.log('✅ Modal d\'ajout ouvert');
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
  
  console.log('➕ Ajout utilisateur:', { discordId, canAccess, roleIds });
  
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
      console.error('❌ Erreur ajout:', data);
      showAlert('addUserAlert', data.error || 'Erreur lors de l\'ajout', 'error');
      return;
    }
    
    console.log('✅ Utilisateur ajouté:', data.user);
    showAlert('addUserAlert', '✅ Utilisateur ajouté avec succès !', 'success');
    
    // Recharger la liste après 1 seconde
    setTimeout(() => {
      closeAddUserModal();
      loadUsers();
    }, 1000);
    
  } catch (error) {
    console.error('❌ Erreur addUser:', error);
    showAlert('addUserAlert', 'Erreur serveur', 'error');
  }
}

// Ouvrir le modal de modification
function editUser(user) {
  // S'assurer que les rôles sont chargés
  if (!isRolesLoaded) {
    console.warn('⚠️ Rôles pas encore chargés, rechargement...');
    loadRoles().then(() => {
      editUser(user);
    });
    return;
  }
  
  console.log('✏️ Édition utilisateur:', user);
  
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
  
  // 🔥 CORRECTION : Parser et cocher les rôles correctement
  let userRoles = [];
  try {
    if (typeof user.roles === 'string') {
      userRoles = JSON.parse(user.roles);
    } else if (Array.isArray(user.roles)) {
      userRoles = user.roles;
    }
  } catch (e) {
    console.error('Erreur parsing rôles:', e);
    userRoles = [];
  }
  
  console.log('Rôles utilisateur:', userRoles);
  console.log('Rôles disponibles:', allRoles);
  
  // Décocher toutes les checkboxes d'abord
  document.querySelectorAll('#editRolesCheckboxes .role-checkbox').forEach(cb => {
    cb.checked = false;
  });
  
  // Cocher les rôles que l'utilisateur possède
  if (userRoles && userRoles.length > 0) {
    userRoles.forEach(userRole => {
      const roleId = userRole.role_id;
      const checkbox = document.querySelector(`#editRolesCheckboxes .role-checkbox[value="${roleId}"]`);
      if (checkbox) {
        checkbox.checked = true;
        console.log(`✅ Rôle ${userRole.role_name} (ID: ${roleId}) coché`);
      } else {
        console.warn(`⚠️ Checkbox pour rôle ID ${roleId} non trouvée`);
      }
    });
  }
  
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
  
  console.log('💾 Sauvegarde utilisateur:', { userId, canAccess, isActive, roleIds });
  
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
      console.error('❌ Erreur modification:', data);
      showAlert('editUserAlert', data.error || 'Erreur lors de la modification', 'error');
      return;
    }
    
    console.log('✅ Utilisateur modifié:', data.user);
    showAlert('editUserAlert', '✅ Utilisateur modifié avec succès !', 'success');
    
    // Recharger la liste après 1 seconde
    setTimeout(() => {
      closeEditUserModal();
      loadUsers();
    }, 1000);
    
  } catch (error) {
    console.error('❌ Erreur saveUser:', error);
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
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  alert(`❌ ${message}`);
}

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

// Toggle la permission de gestion des votes
async function toggleVoteManagement(userId, enable) {
  const action = enable ? 'autoriser' : 'retirer';
  
  if (!confirm(`Voulez-vous vraiment ${action} la gestion des votes pour cet utilisateur ?`)) {
    return;
  }
  
  try {
    console.log(`🗳️ ${enable ? 'Autorisation' : 'Retrait'} gestion votes pour user ${userId}`);
    
    const response = await fetch('/api/admin/update-user', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        can_manage_votes: enable
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors de la modification');
    }
    
    const data = await response.json();
    
    alert(`✅ ${data.message || (enable ? 'Permission accordée' : 'Permission retirée') + ' avec succès !'}`);
    
    // Recharger la liste des utilisateurs
    await loadUsers();
    
  } catch (error) {
    console.error('Erreur toggleVoteManagement:', error);
    alert(`❌ ${error.message || 'Impossible de modifier la permission'}`);
  }
}

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Initialisation page admin...');
  
  // Vérifier l'authentification
  // await checkAuth(); // Géré par auth-admin.js
  
  // Charger les rôles et utilisateurs en parallèle
  const rolesLoaded = await loadRoles();
  
  if (rolesLoaded) {
    await loadUsers();
    console.log('✅ Page admin chargée avec succès');
  } else {
    console.error('❌ Impossible de charger les rôles');
  }
});
