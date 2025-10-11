// public/js/tickets.js
// Gestion des tickets côté client

let allTickets = [];
let currentFilters = {
  status: null,
  priority: null,
  category_id: null,
  assigned_to: null,
  search: null
};

// Charger les tickets depuis l'API
async function loadTickets() {
  try {
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
    
  } catch (error) {
    console.error('Erreur loadTickets:', error);
    showError('Impossible de charger les tickets');
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
  
  // Ajouter le bouton claim si le ticket n'est pas assigné
  addClaimButton(ticket);
  
  // Afficher le modal
  modal.classList.add('active');
}

// Ajouter un bouton claim au modal
function addClaimButton(ticket) {
  const modalHeader = document.querySelector('.modal-header');
  if (!modalHeader) return;
  
  // Supprimer l'ancien bouton s'il existe
  const existingBtn = modalHeader.querySelector('.claim-btn');
  if (existingBtn) existingBtn.remove();
  
  // Ajouter le bouton claim seulement si le ticket n'est pas assigné
  if (!ticket.assigned_to_user_id && currentUser) {
    const claimBtn = document.createElement('button');
    claimBtn.className = 'btn btn-primary claim-btn';
    claimBtn.textContent = '✋ Claim ce ticket';
    claimBtn.style.marginLeft = 'auto';
    claimBtn.style.marginRight = '1rem';
    claimBtn.onclick = () => claimTicket(ticket.id);
    
    const closeBtn = modalHeader.querySelector('.close-btn');
    modalHeader.insertBefore(claimBtn, closeBtn);
  }
}

// Claim un ticket
async function claimTicket(ticketId) {
  try {
    const response = await fetch('/api/claim-ticket', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ticket_id: ticketId })
    });
    
    if (!response.ok) {
      throw new Error('Erreur lors du claim');
    }
    
    const data = await response.json();
    
    // Recharger les tickets
    await loadTickets();
    
    // Fermer le modal
    closeTicketDetail();
    
    showSuccess('Ticket assigné avec succès !');
    
  } catch (error) {
    console.error('Erreur claimTicket:', error);
    showError('Impossible d\'assigner le ticket');
  }
}

// Fermer le modal de détail
function closeTicketDetail() {
  const modal = document.getElementById('ticketModal');
  if (modal) {
    modal.classList.remove('active');
  }
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
});
