// public/js/tickets.js
// Gestion des tickets côté client - VERSION CORRIGÉE AVEC FILTRAGE SERVEUR

let allTickets = [];
let allStaffUsers = [];
let currentTab = 'active'; // Onglet actif par défaut
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

// Changer d'onglet
function switchTab(tabName) {
  currentTab = tabName;
  
  // Mettre à jour l'UI des onglets
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  
  // Recharger les tickets avec le filtre approprié
  loadTickets();
}

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

// Charger les tickets depuis l'API - VERSION CORRIGÉE
async function loadTickets(silent = false) {
  try {
    if (!silent) {
      console.log('📥 Chargement des tickets...');
    }
    
    // Construire l'URL avec les filtres
    const params = new URLSearchParams();
    
    // ✅ FIX : Ajouter le filtre de statut selon l'onglet actif CÔTÉ SERVEUR
    if (currentTab === 'active') {
      // Pour l'onglet actif : on veut tous les tickets SAUF les résolus
      // On va utiliser un paramètre spécial "exclude_status" ou filtrer différemment
      // Solution simple : ne pas mettre de filtre status, mais on va gérer ça côté serveur
      params.append('exclude_status', 'resolu');
    } else if (currentTab === 'resolved') {
      // Pour l'onglet résolu : on veut UNIQUEMENT les résolus
      params.append('status', 'resolu');
    }
    
    // Ajouter les autres filtres
    Object.keys(currentFilters).forEach(key => {
      if (currentFilters[key] && key !== 'status') {
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
    
    // ✅ FIX : Plus besoin de filtrer côté client, le serveur le fait
    allTickets = data.tickets;
    
    // Mettre à jour l'affichage
    displayTickets(allTickets);
    updateStats(data.stats);
    updateTabBadges(data.stats);
    
    if (!silent) {
      console.log(`✅ ${allTickets.length} tickets chargés (onglet: ${currentTab})`);
    }
    
  } catch (error) {
    console.error('Erreur loadTickets:', error);
    if (!silent) {
      showError('Impossible de charger les tickets');
    }
  }
}

// Mettre à jour les badges des onglets
function updateTabBadges(stats) {
  const activeCount = stats.active_count || 0;
  const resolvedCount = stats.resolved_count || 0;
  
  const activeBadge = document.getElementById('activeTabBadge');
  const resolvedBadge = document.getElementById('resolvedTabBadge');
  
  if (activeBadge) activeBadge.textContent = activeCount;
  if (resolvedBadge) resolvedBadge.textContent = resolvedCount;
  
  console.log(`📊 Badges mis à jour - Actifs: ${activeCount}, Résolus: ${resolvedCount}`);
}

// Afficher les tickets dans le DOM
function displayTickets(tickets) {
  const container = document.querySelector('.tickets-grid');
  if (!container) return;
  
  if (tickets.length === 0) {
    const emptyMessage = currentTab === 'active' 
      ? 'Aucun ticket actif trouvé' 
      : 'Aucun ticket résolu trouvé';
    
    container.innerHTML = `
      <div style="
        text-align: center;
        padding: 4rem 2rem;
        color: #b5bac1;
      ">
        <div style="font-size: 3rem; margin-bottom: 1rem;">📭</div>
        <h3 style="font-size: 1.2rem; margin-bottom: 0.5rem;">${emptyMessage}</h3>
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
          Priorité ${ticket.priority || 'non définie'}
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
  return indicators[priority] || '<span class="priority-indicator" style="background: var(--text-muted);"></span>';
}

// Marquer tous les tickets comme lus
async function markAllAsRead() {
  // Confirmation
  if (!confirm('Voulez-vous vraiment marquer tous les tickets comme lus ?')) {
    return;
  }
  
  try {
    console.log('📖 Marquage de tous les tickets comme lus...');
    
    const response = await fetch('/api/mark-all-as-read', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Erreur lors du marquage');
    }
    
    const data = await response.json();
    
    console.log(`✅ ${data.tickets_marked} tickets marqués comme lus`);
    showSuccess(data.message || 'Tous les tickets ont été marqués comme lus !');
    
    // Recharger les tickets pour mettre à jour l'affichage
    await loadTickets();
    
  } catch (error) {
    console.error('❌ Erreur markAllAsRead:', error);
    showError('Impossible de marquer les tickets comme lus');
  }
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
  
  // Ajouter le dropdown de priorité
  addPriorityDropdown(ticket);
  
  // Ajouter le bouton d'assignation si le ticket n'est pas assigné
  addClaimButton(ticket);
  
  // Ajouter le bouton "Voir sur Discord" avec gestion intelligente app/web
  addDiscordButton(ticket);
  
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
  
  // Ajouter l'interface d'assignation (sauf si ticket résolu)
  if (ticket.status !== 'resolu' && currentUser) {
    // Récupérer la liste des utilisateurs staff (utiliser cache si déjà chargé)
    if (allStaffUsers.length === 0) {
      await loadStaffUsers();
    }
    const staffUsers = allStaffUsers;
    
    // Créer le conteneur d'assignation
    const assignContainer = document.createElement('div');
    assignContainer.className = 'assign-container';
    assignContainer.style.cssText = 'display: flex; gap: 0.5rem; margin-left: auto; margin-right: 1rem; position: relative; align-items: center;';
    
    // Bouton principal "Assigner ce ticket" ou "Réassigner ce ticket"
    const assignBtn = document.createElement('button');
    assignBtn.className = 'btn btn-primary';
    // Texte différent selon l'état d'assignation
    const btnText = ticket.assigned_to_user_id ? '🔄 Réassigner ce ticket ▼' : '✋ Assigner ce ticket ▼';
    assignBtn.innerHTML = btnText;
    assignBtn.style.cssText = 'cursor: pointer; height: 36px; flex-shrink: 0; display: flex; align-items: center; white-space: nowrap;';
    
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
    
    // Vérifier si l'utilisateur courant est déjà assigné
    const isCurrentlyAssigned = ticket.assigned_to_user_id === currentUser.id;
    const checkmark = isCurrentlyAssigned ? '✅ ' : '';
    
    selfOption.innerHTML = `
      <img src="${currentUser.discord_avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" 
           style="width: 32px; height: 32px; border-radius: 50%;" alt="Avatar">
      <div style="flex: 1;">
        <div style="font-weight: 600; color: var(--text-primary);">
          ${checkmark}${escapeHtml(currentUser.discord_global_name || currentUser.discord_username)} (Moi)
        </div>
        <div style="font-size: 0.8rem; color: var(--text-secondary);">
          ${isCurrentlyAssigned ? 'Actuellement assigné' : 'M\'assigner ce ticket'}
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
      const separatorText = ticket.assigned_to_user_id ? 'Réassigner à un autre staff' : 'Assigner à un autre staff';
      separator.textContent = separatorText;
      dropdown.appendChild(separator);
      
      // Ajouter chaque utilisateur
      staffUsers.forEach(user => {
        // Ne pas afficher l'utilisateur courant (déjà affiché en premier)
        if (user.id === currentUser.id) return;
        
        // Vérifier si cet utilisateur est actuellement assigné
        const isAssigned = ticket.assigned_to_user_id === user.id;
        const checkmark = isAssigned ? '✅ ' : '';
        
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
              ${checkmark}${escapeHtml(user.discord_global_name || user.discord_username)}
              ${roleBadge}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              ${isAssigned ? 'Actuellement assigné' : '@' + escapeHtml(user.discord_username)}
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

// Ajouter un bouton "Voir sur Discord" au modal avec ouverture intelligente app/web
function addDiscordButton(ticket) {
  const modalHeader = document.querySelector('.modal-header');
  if (!modalHeader) return;
  
  // Supprimer l'ancien bouton Discord s'il existe
  const existingBtn = modalHeader.querySelector('.discord-button');
  if (existingBtn) existingBtn.remove();
  
  // ID du serveur Discord (Vertigo RP)
  const DISCORD_SERVER_ID = '1288511254369013831';
  
  // Construire les URLs Discord (app et web)
  const discordAppUrl = `discord://discord.com/channels/${DISCORD_SERVER_ID}/${ticket.discord_channel_id}`;
  const discordWebUrl = `https://discord.com/channels/${DISCORD_SERVER_ID}/${ticket.discord_channel_id}`;
  
  // Créer le bouton Discord
  const discordBtn = document.createElement('button');
  discordBtn.className = 'btn discord-button';
  discordBtn.style.cssText = `
    background: #5865f2;
    color: white;
    border: none;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: 0.5rem;
    cursor: pointer;
    padding: 0.65rem 1.25rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    transition: background 0.2s;
    height: 36px;
    flex-shrink: 0;
    white-space: nowrap;
  `;
  discordBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clip-path="url(#clip0)">
        <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="white"/>
      </g>
      <defs>
        <clipPath id="clip0">
          <rect width="71" height="55" fill="white"/>
        </clipPath>
      </defs>
    </svg>
    Voir sur Discord
  `;
  
  // Gestion intelligente de l'ouverture : tenter l'app Discord d'abord, puis fallback vers le web
  discordBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('🎮 Tentative d\'ouverture de Discord...');
    
    // Tenter d'ouvrir l'application Discord via un iframe invisible
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = discordAppUrl;
    document.body.appendChild(iframe);
    
    // Fallback automatique vers le web après 1 seconde si l'app ne s'ouvre pas
    const fallbackTimer = setTimeout(() => {
      console.log('⏱️ Timeout atteint - Ouverture web en fallback');
      window.open(discordWebUrl, '_blank', 'noopener,noreferrer');
      
      // Nettoyer l'iframe
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 1000);
    
    // Si la fenêtre perd le focus (= l'app Discord s'est ouverte), annuler le fallback
    const blurHandler = () => {
      console.log('✅ Application Discord ouverte - Annulation du fallback');
      clearTimeout(fallbackTimer);
      
      // Nettoyer l'iframe après un court délai
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 100);
      
      // Retirer ce listener après usage
      window.removeEventListener('blur', blurHandler);
    };
    
    window.addEventListener('blur', blurHandler);
    
    // Nettoyer après 2 secondes dans tous les cas (sécurité)
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
      window.removeEventListener('blur', blurHandler);
    }, 2000);
  };
  
  // Ajouter le hover effect
  discordBtn.onmouseenter = () => discordBtn.style.background = '#4752c4';
  discordBtn.onmouseleave = () => discordBtn.style.background = '#5865f2';
  
  // Insérer le bouton juste avant le bouton de fermeture
  const closeBtn = modalHeader.querySelector('.close-btn');
  if (closeBtn) {
    modalHeader.insertBefore(discordBtn, closeBtn);
  } else {
    modalHeader.appendChild(discordBtn);
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

// Mettre à jour la priorité d'un ticket
async function updateTicketPriority(ticketId, newPriority) {
  try {
    console.log(`🎯 Mise à jour priorité du ticket ${ticketId} → ${newPriority || 'aucune'}`);
    
    const response = await fetch('/api/update-ticket-priority', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        ticket_id: ticketId,
        priority: newPriority
      })
    });
    
    if (!response.ok) {
      throw new Error('Erreur lors de la mise à jour de la priorité');
    }
    
    const data = await response.json();
    
    // Afficher un message de succès
    showSuccess(data.message || 'Priorité mise à jour avec succès !');
    
    // Recharger les tickets pour mettre à jour l'affichage
    await loadTickets(true); // Refresh silencieux
    
  } catch (error) {
    console.error('Erreur updateTicketPriority:', error);
    showError('Impossible de mettre à jour la priorité');
  }
}

// Ajouter un dropdown de sélection de priorité au modal
function addPriorityDropdown(ticket) {
  const modalHeader = document.querySelector('.modal-header');
  if (!modalHeader) return;
  
  // Supprimer l'ancien conteneur de priorité s'il existe
  const existingContainer = modalHeader.querySelector('.priority-container');
  if (existingContainer) existingContainer.remove();
  
  // Ne pas afficher le dropdown de priorité pour les tickets résolus
  if (ticket.status === 'resolu') return;
  
  // Créer le conteneur de priorité
  const priorityContainer = document.createElement('div');
  priorityContainer.className = 'priority-container';
  priorityContainer.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; margin-left: 1rem;';
  
  // Label
  const label = document.createElement('span');
  label.textContent = 'Priorité:';
  label.style.cssText = 'color: var(--text-secondary); font-size: 0.9rem; font-weight: 500;';
  
  // Dropdown
  const select = document.createElement('select');
  select.className = 'priority-select';
  select.style.cssText = `
    padding: 0.5rem 0.75rem;
    background: var(--discord-light);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.9rem;
    cursor: pointer;
    min-width: 140px;
    height: 36px;
    flex-shrink: 0;
  `;
  
  // Options du dropdown
  const priorities = [
    { value: '', label: '⚪ Non définie', color: 'var(--text-muted)' },
    { value: 'haute', label: '🔴 Haute', color: 'var(--danger)' },
    { value: 'moyenne', label: '🟡 Moyenne', color: 'var(--warning)' },
    { value: 'basse', label: '🟢 Basse', color: 'var(--success)' }
  ];
  
  priorities.forEach(p => {
    const option = document.createElement('option');
    option.value = p.value;
    option.textContent = p.label;
    option.style.color = p.color;
    if (p.value === (ticket.priority || '')) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  
  // Gérer le changement de priorité
  select.addEventListener('change', async (e) => {
    const newPriority = e.target.value || null;
    
    // Confirmation si changement vers "Non définie"
    if (newPriority === null && ticket.priority) {
      if (!confirm('Voulez-vous vraiment retirer la priorité de ce ticket ?')) {
        e.target.value = ticket.priority || '';
        return;
      }
    }
    
    // Désactiver le select pendant la mise à jour
    select.disabled = true;
    select.style.opacity = '0.6';
    
    try {
      await updateTicketPriority(ticket.id, newPriority);
      // Mettre à jour l'objet ticket local
      ticket.priority = newPriority;
    } catch (error) {
      // Restaurer l'ancienne valeur en cas d'erreur
      e.target.value = ticket.priority || '';
    } finally {
      select.disabled = false;
      select.style.opacity = '1';
    }
  });
  
  priorityContainer.appendChild(label);
  priorityContainer.appendChild(select);
  
  // Insérer avant le bouton de fermeture ou après le conteneur d'assignation
  const closeBtn = modalHeader.querySelector('.close-btn');
  const assignContainer = modalHeader.querySelector('.assign-container');
  
  if (assignContainer) {
    modalHeader.insertBefore(priorityContainer, assignContainer);
  } else if (closeBtn) {
    modalHeader.insertBefore(priorityContainer, closeBtn);
  } else {
    modalHeader.appendChild(priorityContainer);
  }
}

// Fermer le modal de détail ET forcer un refresh
function closeTicketDetail() {
  const modal = document.getElementById('ticketModal');
  if (modal) {
    modal.classList.remove('active');
  }
  
  // Forcer un refresh après fermeture de la popup
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
  
  // Auto-refresh : Actualiser automatiquement toutes les 2 minutes
  setInterval(() => {
    console.log('🔄 Auto-refresh des tickets...');
    loadTickets(true); // true = refresh silencieux
  }, AUTO_REFRESH_DELAY);
  
  console.log(`✅ Auto-refresh activé : actualisation toutes les ${AUTO_REFRESH_DELAY / 1000} secondes`);
});
