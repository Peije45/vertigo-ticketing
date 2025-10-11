// public/js/tickets.js
// Gestion des tickets côté client - VERSION AVEC AUTO-REFRESH ET ASSIGNATION FLEXIBLE

let allTickets = [];
let allStaffUsers = [];
let currentFilters = {
  status: null,
  priority: null,
  category_id: null,
  assigned_to: null,
  search: null
};

// Variables pour l'auto-refresh
let autoRefreshInterval = null;
const AUTO_REFRESH_DELAY = 120000; // 2 minutes en millisecondes

// Charger la liste des utilisateurs staff
async function loadStaffUsers() {
  try {
    const response = await fetch('/api/get-staff-users', {
      credentials: 'include'
    });
    
    if (response.ok) {
      allStaffUsers = await response.json();
      console.log(`✅ ${allStaffUsers.length} utilisateurs staff chargés`);
      return allStaffUsers;
    } else {
      console.error('❌ Erreur chargement staff:', response.status);
      return [];
    }
  } catch (error) {
    console.error('❌ Erreur loadStaffUsers:', error);
    return [];
  }
}

// Charger les tickets depuis l'API
async function loadTickets(silent = false) {
  try {
    if (!silent) {
      console.log('📥 Chargement des tickets...');
    }
    
    // Construire l'URL avec les filtres
    const params = new URLSearchParams();
    Object.keys(currentFilters).forEach(key => {
      if (currentFilters[key]) {
        params.append(key, currentFilters[key]);
      }
    });
    
    const response = await fetch(`/api/get-tickets?${params.toString()}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Erreur chargement tickets');
    }
    
    const data = await response.json();
    allTickets = data.tickets;
    
    // Mettre à jour l'affichage
    displayTickets(allTickets);
    updateStats(data.stats);
    
    if (!silent) {
      console.log(`✅ ${allTickets.length} tickets chargés`);
    }
    
  } catch (error) {
    console.error('Erreur loadTickets:', error);
    if (!silent) {
      showError('Impossible de charger les tickets');
    }
  }
}

// Afficher les tickets dans le DOM
function displayTickets(tickets) {
  const container = document.querySelector('.tickets-grid');
  if (!container) return;
  
  if (tickets.length === 0) {
    container.innerHTML = `
      <div style="
        text-align: center;
        padding: 4rem 2rem;
        color: #b5bac1;
      ">
        <div style="font-size: 3rem; margin-bottom: 1rem;">📭</div>
        <h3 style="font-size: 1.2rem; margin-bottom: 0.5rem;">Aucun ticket trouvé</h3>
        <p>Essayez de modifier vos filtres de recherche</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = tickets.map(ticket => createTicketCard(ticket)).join('');
}

// Créer une carte de ticket
function createTicketCard(ticket) {
  const isUnread = ticket.is_unread ? 'unread' : '';
  const notificationBadge = ticket.unread_count > 0 
    ? `<div class="notification-badge">${ticket.unread_count}</div>` 
    : '';
  
  const statusBadge = getStatusBadge(ticket.status);
  const priorityIndicator = getPriorityIndicator(ticket.priority);
  const categoryBadge = ticket.category_name 
    ? `<span class="badge category">${ticket.category_emoji || ''} ${ticket.category_name}</span>` 
    : '';
  
  const assignedUser = ticket.assigned_to_username
    ? `
      <div class="assigned-user">
        <img src="${ticket.assigned_to_avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="Assigned">
        ${ticket.assigned_to_display_name || ticket.assigned_to_username}
      </div>
    `
    : `<div class="assigned-user">Non assigné</div>`;
  
  return `
    <div class="ticket-card ${isUnread}" onclick="openTicketDetail('${ticket.id}')">
      ${notificationBadge}
      <div class="ticket-header">
        <div>
          <div class="ticket-title">${escapeHtml(ticket.title)}</div>
          <div class="ticket-id">#${ticket.discord_channel_id.substring(0, 20)}...</div>
        </div>
        <div class="ticket-badges">
          ${statusBadge}
          ${categoryBadge}
        </div>
      </div>
      <div class="ticket-meta">
        <div class="ticket-meta-item">
          ${priorityIndicator}
          Priorité ${ticket.priority}
        </div>
        <div class="ticket-meta-item">
          <img src="${ticket.created_by_avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="User">
          ${escapeHtml(ticket.created_by_username || 'Inconnu')}
        </div>
        <div class="ticket-meta-item">
          ⏰ ${formatTimeAgo(ticket.created_at)}
        </div>
        ${assignedUser}
      </div>
    </div>
  `;
}

// Obtenir le badge de statut
function getStatusBadge(status) {
  const badges = {
    'nouveau': '<span class="badge new">NEW</span>',
    'en_cours': '<span class="badge pending">EN COURS</span>',
    'resolu': '<span class="badge resolved">RÉSOLU</span>',
    'urgent': '<span class="badge urgent">URGENT</span>'
  };
  return badges[status] || '';
}

// Obtenir l'indicateur de priorité
function getPriorityIndicator(priority) {
  const indicators = {
    'haute': '<span class="priority-indicator priority-high"></span>',
    'moyenne': '<span class="priority-indicator priority-medium"></span>',
    'basse': '<span class="priority-indicator priority-low"></span>'
  };
  return indicators[priority] || indicators['moyenne'];
}

// Ouvrir le détail d'un ticket
async function openTicketDetail(ticketId) {
  try {
    const response = await fetch(`/api/get-ticket-details?ticket_id=${ticketId}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Erreur chargement détails ticket');
    }
    
    const data = await response.json();
    displayTicketModal(data.ticket, data.messages);
    
  } catch (error) {
    console.error('Erreur openTicketDetail:', error);
    showError('Impossible de charger les détails du ticket');
  }
}

// Afficher le modal de détail du ticket
function displayTicketModal(ticket, messages) {
  const modal = document.getElementById('ticketModal');
  if (!modal) return;
  
  // Mettre à jour le header du modal
  const titleElement = modal.querySelector('.ticket-title');
  const idElement = modal.querySelector('.ticket-id');
  
  if (titleElement) titleElement.textContent = ticket.title;
  if (idElement) idElement.textContent = `#${ticket.discord_channel_id}`;
  
  // Mettre à jour les messages
  const messagesContainer = modal.querySelector('.message-thread');
  if (messagesContainer) {
    messagesContainer.innerHTML = messages.map(msg => `
      <div class="message">
        <img src="${msg.author_avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="Avatar" class="message-avatar">
        <div class="message-content">
          <div>
            <span class="message-author">${escapeHtml(msg.author_username || 'Inconnu')}</span>
            <span class="message-timestamp">${formatDateTime(msg.created_at)}</span>
          </div>
          <div class="message-text">${escapeHtml(msg.content)}</div>
        </div>
      </div>
    `).join('');
  }
  
  // Ajouter le bouton d'assignation si le ticket n'est pas assigné
  addClaimButton(ticket);
  
  // Afficher le modal
  modal.classList.add('active');
}

// Ajouter un bouton d'assignation au modal
async function addClaimButton(ticket) {
  const modalHeader = document.querySelector('.modal-header');
  if (!modalHeader) return;
  
  // Supprimer l'ancien conteneur d'assignation s'il existe
  const existingContainer = modalHeader.querySelector('.assign-container');
  if (existingContainer) existingContainer.remove();
  
  // Ajouter l'interface d'assignation seulement si le ticket n'est pas assigné
  if (!ticket.assigned_to_user_id && currentUser) {
    // Récupérer la liste des utilisateurs staff (utiliser cache si déjà chargé)
    if (allStaffUsers.length === 0) {
      await loadStaffUsers();
    }
    const staffUsers = allStaffUsers;
    
    // Créer le conteneur d'assignation
    const assignContainer = document.createElement('div');
    assignContainer.className = 'assign-container';
    assignContainer.style.cssText = 'display: flex; gap: 0.5rem; margin-left: auto; margin-right: 1rem; position: relative;';
    
    // Bouton principal "Assigner ce ticket"
    const assignBtn = document.createElement('button');
    assignBtn.className = 'btn btn-primary';
    assignBtn.innerHTML = '✋ Assigner ce ticket ▼';
    assignBtn.style.cssText = 'cursor: pointer;';
    
    // Menu déroulant des utilisateurs
    const dropdown = document.createElement('div');
    dropdown.className = 'assign-dropdown';
    dropdown.style.cssText = `
      display: none;
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 0.5rem;
      background: var(--discord-dark);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      padding: 0.5rem 0;
      min-width: 250px;
      max-height: 400px;
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 1000;
    `;
    
    // Option "M'assigner à moi"
    const selfOption = document.createElement('div');
    selfOption.className = 'assign-option';
    selfOption.style.cssText = `
      padding: 0.75rem 1rem;
      cursor: pointer;
      transition: background 0.2s;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    `;
    selfOption.innerHTML = `
      <img src="${currentUser.discord_avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
           style="width: 32px; height: 32px; border-radius: 50%;" alt="Avatar">
      <div>
        <div style="font-weight: 600; color: var(--text-primary);">
          ${escapeHtml(currentUser.discord_global_name || currentUser.discord_username)} (Moi)
        </div>
        <div style="font-size: 0.8rem; color: var(--text-secondary);">
          M'assigner ce ticket
        </div>
      </div>
    `;
    selfOption.onmouseenter = () => selfOption.style.background = 'var(--discord-hover)';
    selfOption.onmouseleave = () => selfOption.style.background = 'transparent';
    selfOption.onclick = () => {
      dropdown.style.display = 'none';
      claimTicket(ticket.id, currentUser.id);
    };
    dropdown.appendChild(selfOption);
    
    // Options pour les autres utilisateurs staff
    if (staffUsers && staffUsers.length > 0) {
      // Ajouter un séparateur
      const separator = document.createElement('div');
      separator.style.cssText = 'padding: 0.5rem 1rem; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;';
      separator.textContent = 'Assigner à un autre staff';
      dropdown.appendChild(separator);
      
      // Ajouter chaque utilisateur
      staffUsers.forEach(user => {
        // Ne pas afficher l'utilisateur courant (déjà affiché en premier)
        if (user.id === currentUser.id) return;
        
        const option = document.createElement('div');
        option.className = 'assign-option';
        option.style.cssText = `
          padding: 0.75rem 1rem;
          cursor: pointer;
          transition: background 0.2s;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        `;
        
        // Déterminer le badge de rôle
        let roleBadge = '';
        if (user.roles && user.roles.length > 0) {
          const roleEmojis = {
            'fondateur': '👑',
            'dev': '💻',
            'admin': '⚡',
            'modo': '🛡️',
            'support': '🎯'
          };
          const primaryRole = user.roles[0];
          const emoji = roleEmojis[primaryRole.role_name] || '👤';
          roleBadge = `<span style="font-size: 0.7rem; padding: 0.15rem 0.4rem; background: var(--discord-light); border-radius: 4px; color: var(--text-secondary);">${emoji} ${primaryRole.role_name}</span>`;
        }
        
        option.innerHTML = `
          <img src="${user.discord_avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
               style="width: 32px; height: 32px; border-radius: 50%;" alt="Avatar">
          <div style="flex: 1;">
            <div style="font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">
              ${escapeHtml(user.discord_global_name || user.discord_username)}
              ${roleBadge}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              @${escapeHtml(user.discord_username)}
            </div>
          </div>
        `;
        option.onmouseenter = () => option.style.background = 'var(--discord-hover)';
        option.onmouseleave = () => option.style.background = 'transparent';
        option.onclick = () => {
          dropdown.style.display = 'none';
          claimTicket(ticket.id, user.id);
        };
        dropdown.appendChild(option);
      });
    }
    
    // Toggle du dropdown au clic sur le bouton
    assignBtn.onclick = (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    };
    
    // Fermer le dropdown au clic extérieur
    const closeDropdown = (e) => {
      if (!assignContainer.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    };
    document.addEventListener('click', closeDropdown);
    
    assignContainer.appendChild(assignBtn);
    assignContainer.appendChild(dropdown);
    
    const closeBtn = modalHeader.querySelector('.close-btn');
    modalHeader.insertBefore(assignContainer, closeBtn);
  }
}

// Claim un ticket (assignation)
async function claimTicket(ticketId, userId) {
  try {
    console.log(`🎯 Assignation du ticket ${ticketId} à l'utilisateur ${userId}`);
    
    const response = await fetch('/api/claim-ticket', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        ticket_id: ticketId,
        user_id: userId
      })
    });
    
    if (!response.ok) {
      throw new Error('Erreur lors de l\'assignation');
    }
    
    const data = await response.json();
    
    // Afficher le nom de l'utilisateur assigné
    const assignedUser = allStaffUsers.find(u => u.id === userId) || currentUser;
    const userName = assignedUser.discord_global_name || assignedUser.discord_username || 'l\'utilisateur';
    
    // Recharger les tickets
    await loadTickets();
    
    // Fermer le modal
    closeTicketDetail();
    
    showSuccess(`Ticket assigné avec succès à ${userName} !`);
    
  } catch (error) {
    console.error('Erreur claimTicket:', error);
    showError('Impossible d\'assigner le ticket');
  }
}

// ✅ Fermer le modal de détail ET forcer un refresh
function closeTicketDetail() {
  const modal = document.getElementById('ticketModal');
  if (modal) {
    modal.classList.remove('active');
  }
  
  // ✅ FORCER UN REFRESH après fermeture de la popup
  console.log('🔄 Refresh après fermeture de la popup des messages');
  loadTickets(false); // Refresh visible (non-silencieux)
}

// Mettre à jour les statistiques
function updateStats(stats) {
  if (!stats) return;
  
  const urgentElement = document.querySelector('.stat-card.urgent .stat-number');
  const pendingElement = document.querySelector('.stat-card.pending .stat-number');
  const resolvedElement = document.querySelector('.stat-card.resolved .stat-number');
  const avgTimeElement = document.querySelector('.stat-card:not(.urgent):not(.pending):not(.resolved) .stat-number');
  
  if (urgentElement) urgentElement.textContent = stats.urgent_count || 0;
  if (pendingElement) pendingElement.textContent = stats.pending_count || 0;
  if (resolvedElement) resolvedElement.textContent = stats.resolved_7d_count || 0;
  if (avgTimeElement) avgTimeElement.textContent = `${stats.avg_resolution_hours || 0}h`;
}

// Appliquer les filtres
function applyFilters() {
  loadTickets();
}

// Recherche
function handleSearch(searchTerm) {
  currentFilters.search = searchTerm || null;
  loadTickets();
}

// Gérer les filtres de statut
function filterByStatus(status) {
  currentFilters.status = status === 'all' ? null : status;
  loadTickets();
}

// Gérer les filtres de priorité
function filterByPriority(priority) {
  currentFilters.priority = priority === 'all' ? null : priority;
  loadTickets();
}

// Gérer les filtres d'assignation
function filterByAssignation(assigned) {
  currentFilters.assigned_to = assigned === 'all' ? null : assigned;
  loadTickets();
}

// Gérer les filtres de catégorie
function filterByCategory(categoryId) {
  currentFilters.category_id = categoryId === 'all' ? null : categoryId;
  loadTickets();
}

// Utilitaires
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function showError(message) {
  alert(`❌ ${message}`);
}

function showSuccess(message) {
  alert(`✅ ${message}`);
}

// Actualiser les tickets
function refreshTickets() {
  loadTickets();
}

// Event listeners pour les filtres
document.addEventListener('DOMContentLoaded', () => {
  // Barre de recherche
  const searchInput = document.querySelector('.search-box input');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        handleSearch(e.target.value);
      }, 500);
    });
  }
  
  // Bouton actualiser
  const refreshBtn = document.querySelector('.toolbar-actions button:nth-child(1)');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshTickets);
  }
  
  // Fermeture modal au clic extérieur
  const modal = document.getElementById('ticketModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeTicketDetail();
      }
    });
  }
  
  // ✅ AUTO-REFRESH : Actualiser automatiquement toutes les 2 minutes (120000ms)
  setInterval(() => {
    console.log('🔄 Auto-refresh des tickets...');
    loadTickets(true); // true = refresh silencieux
  }, AUTO_REFRESH_DELAY);
  
  console.log(`✅ Auto-refresh activé : actualisation toutes les ${AUTO_REFRESH_DELAY / 1000} secondes`);
});
